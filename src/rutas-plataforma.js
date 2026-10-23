'use strict';
// Plataforma de notas: portada con un acceso por tipo de usuario y un panel por rol (admin, docente, estudiante).
const path = require('node:path');
const express = require('express');
const config = require('./config');
const { usuarios } = require('./db');
const auth = require('./auth');
const { texto } = require('./validacion');
const apiGestion = require('./api-gestion');
const apiNotas = require('./api-notas');

const router = express.Router();
const VISTAS = path.join(config.RAIZ, 'vistas');
const PANELES = { admin: 'admin.html', docente: 'docente.html', estudiante: 'estudiante.html' };
// Acceso por el que debe ingresar cada rol (?tipo= en /ingresar).
const ACCESOS = {
  estudiante: 'el acceso de estudiantes (“Ver mis notas”)',
  docente: 'el acceso de catedráticos (“Ingresar notas”)',
  admin: 'el acceso administrativo',
};

// ---------- Páginas ----------
// Sin sesión: portada con los accesos. Con sesión: el panel del rol.
router.get('/', (req, res) => {
  const u = auth.usuarioDeSesion(req);
  if (!u) return res.sendFile(path.join(VISTAS, 'inicio.html'));
  res.sendFile(path.join(VISTAS, u.debe_cambiar ? 'cambiar-clave.html' : PANELES[u.rol]));
});

router.get('/ingresar', (req, res) => {
  if (auth.usuarioDeSesion(req) || !ACCESOS[req.query.tipo]) return res.redirect('./');
  res.sendFile(path.join(VISTAS, 'ingresar.html'));
});

// ---------- API común ----------
const api = express.Router();
router.use('/api', api);
api.use(express.json({ limit: '200kb' }));
api.use(auth.verificarCsrf);

api.get('/csrf', (req, res) => {
  res.json({ csrf: auth.tokenCsrf(req) });
});

api.post('/login', async (req, res, next) => {
  try {
    const usuario = texto(req.body && req.body.usuario);
    const clave = typeof (req.body && req.body.clave) === 'string' ? req.body.clave : '';
    const tipo = req.body && req.body.tipo;
    if (!usuario || !clave || usuario.length > 50 || clave.length > 200) {
      return res.status(400).json({ error: 'Ingresá usuario y contraseña.' });
    }
    if (!ACCESOS[tipo]) return res.status(400).json({ error: 'Tipo de acceso no válido.' });
    if (auth.estaBloqueado(req, usuario)) {
      return res.status(429).json({ error: 'Demasiados intentos. Esperá 15 minutos.' });
    }
    const fila = await auth.verificarCredenciales(usuario, clave);
    if (!fila) {
      auth.registrarFallo(req, usuario);
      auth.registrar(req, 'Ingreso fallido', usuario.slice(0, 50));
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    auth.limpiarFallos(req, usuario);
    // Cada rol entra solo por su propio acceso.
    if (fila.rol !== tipo) {
      auth.registrar(req, 'Ingreso por acceso equivocado', `${fila.usuario} (${fila.rol}) intentó el acceso de ${tipo}`);
      return res.status(403).json({ error: `Esta cuenta no corresponde a este acceso. Ingresá por ${ACCESOS[fila.rol]}.`, tipoCorrecto: fila.rol });
    }
    // Nuevo identificador de sesión tras autenticar (evita fijación de sesión).
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.usuarioId = fila.id;
      req.session.usuario = fila.usuario;
      auth.tokenCsrf(req);
      req.session.save((err2) => {
        if (err2) return next(err2);
        auth.registrar(req, 'Ingreso', fila.rol);
        res.json({ ok: true });
      });
    });
  } catch (err) { next(err); }
});

api.use(auth.requiereSesionApi);

api.get('/sesion', (req, res) => {
  const u = req.usuario;
  res.json({
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    debeCambiar: Boolean(u.debe_cambiar),
    csrf: auth.tokenCsrf(req),
    notaAprobacion: config.notaAprobacion,
  });
});

api.post('/logout', (req, res, next) => {
  auth.registrar(req, 'Salida');
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

api.post('/clave', async (req, res, next) => {
  try {
    const cuerpo = req.body || {};
    const actual = typeof cuerpo.actual === 'string' ? cuerpo.actual : '';
    const nueva = typeof cuerpo.nueva === 'string' ? cuerpo.nueva : '';
    if (nueva.length < auth.LARGO_MINIMO_CLAVE || nueva.length > 200) {
      return res.status(400).json({ error: `La nueva contraseña debe tener entre ${auth.LARGO_MINIMO_CLAVE} y 200 caracteres.` });
    }
    if (nueva === actual) return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual.' });
    if (!(await auth.verificar(actual, req.usuario.hash))) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }
    usuarios.cambiarHash(req.usuario.id, await auth.hashear(nueva), false);
    auth.registrar(req, 'Contraseña cambiada');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------- API por rol ----------
api.use(auth.exigeClaveDefinitiva);
api.use('/gestion', auth.requiereRol('admin'), apiGestion);
api.use('/docente', apiNotas.docente);
api.use('/estudiante', apiNotas.estudiante);

module.exports = router;
