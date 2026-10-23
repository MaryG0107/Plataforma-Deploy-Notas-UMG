'use strict';
// API del administrador: cuentas, cursos, asignación de estudiantes y bitácora.
const express = require('express');
const { usuarios, cursos, asignaciones, bitacora, transaccion } = require('./db');
const auth = require('./auth');
const { validarUsuario, validarNombre, validarCurso, validarId, texto, COMPONENTES, PATRON_USUARIO } = require('./validacion');

const api = express.Router();
const MAX_LOTE = 200;
const NOMBRES_COMPONENTE = { p1: '1er parcial', p2: '2do parcial', act: 'actividades', final: 'examen final' };

function errorCampos(res, errores) {
  return res.status(400).json({ error: 'Revisá los campos marcados.', errores });
}

// ---------- Usuarios ----------
api.get('/usuarios', (req, res) => {
  const rol = ['admin', 'docente', 'estudiante'].includes(req.query.rol) ? req.query.rol : null;
  res.json(usuarios.listar(rol));
});

api.post('/usuarios', async (req, res, next) => {
  try {
    const { datos, errores } = validarUsuario(req.body || {});
    if (Object.keys(errores).length) return errorCampos(res, errores);
    if (usuarios.buscarPorNombre(datos.usuario)) return errorCampos(res, { usuario: 'Ese usuario ya existe.' });
    const clave = auth.claveTemporal();
    const id = usuarios.crear({ ...datos, hash: await auth.hashear(clave), debeCambiar: true });
    auth.registrar(req, 'Usuario creado', `${datos.usuario} (${datos.rol})`);
    res.status(201).json({ id, usuario: datos.usuario, nombre: datos.nombre, clave });
  } catch (err) { next(err); }
});

// Carga de estudiantes en lote: una línea por estudiante, "carné, nombre" (también acepta ; o tabulación).
api.post('/usuarios/lote', async (req, res, next) => {
  try {
    const lineas = String((req.body && req.body.texto) || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lineas.length) return res.status(400).json({ error: 'Pegá al menos una línea con "carné, nombre".' });
    if (lineas.length > MAX_LOTE) return res.status(400).json({ error: `Máximo ${MAX_LOTE} estudiantes por carga.` });

    const creados = [];
    const rechazados = [];
    for (const [i, linea] of lineas.entries()) {
      const [carneCrudo, ...resto] = linea.split(/[,;\t]/);
      const carne = texto(carneCrudo);
      const nombre = validarNombre(resto.join(' '));
      let motivo = null;
      if (!PATRON_USUARIO.test(carne)) motivo = 'Carné no válido';
      else if (!nombre) motivo = 'Nombre no válido';
      else if (usuarios.buscarPorNombre(carne)) motivo = 'Ya existe';
      if (motivo) { rechazados.push({ linea: i + 1, texto: linea.slice(0, 80), motivo }); continue; }

      const clave = auth.claveTemporal();
      usuarios.crear({ usuario: carne, nombre, rol: 'estudiante', hash: await auth.hashear(clave), debeCambiar: true });
      creados.push({ usuario: carne, nombre, clave });
    }
    if (creados.length) auth.registrar(req, 'Estudiantes creados en lote', `${creados.length} cuentas`);
    res.json({ creados, rechazados });
  } catch (err) { next(err); }
});

api.put('/usuarios/:id', (req, res) => {
  const id = validarId(req.params.id);
  const fila = id && usuarios.buscarPorId(id);
  if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const nombre = validarNombre(req.body && req.body.nombre);
  if (!nombre) return errorCampos(res, { nombre: 'El nombre debe tener entre 3 y 100 caracteres.' });
  const activo = Boolean(req.body.activo);
  if (!activo && fila.id === req.usuario.id) return res.status(400).json({ error: 'No podés desactivar tu propia cuenta.' });
  usuarios.actualizar(id, nombre, activo);
  if (Boolean(fila.activo) !== activo) auth.registrar(req, activo ? 'Usuario activado' : 'Usuario desactivado', fila.usuario);
  res.json({ ok: true });
});

api.post('/usuarios/:id/restablecer', async (req, res, next) => {
  try {
    const id = validarId(req.params.id);
    const fila = id && usuarios.buscarPorId(id);
    if (!fila) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (fila.id === req.usuario.id) return res.status(400).json({ error: 'Para tu propia cuenta usá "Cambiar mi contraseña".' });
    const clave = auth.claveTemporal();
    usuarios.cambiarHash(id, await auth.hashear(clave), true);
    auth.registrar(req, 'Contraseña restablecida', fila.usuario);
    res.json({ usuario: fila.usuario, clave });
  } catch (err) { next(err); }
});

// ---------- Cursos ----------
function docenteValido(id) {
  if (!id) return true;
  const u = usuarios.buscarPorId(id);
  return Boolean(u && u.rol === 'docente' && u.activo);
}

api.get('/cursos', (req, res) => {
  res.json(cursos.listar());
});

api.post('/cursos', (req, res) => {
  const { datos, errores } = validarCurso(req.body || {});
  if (!errores.docente_id && !docenteValido(datos.docente_id)) errores.docente_id = 'Seleccioná un catedrático activo.';
  if (Object.keys(errores).length) return errorCampos(res, errores);
  try {
    const id = cursos.crear(datos);
    auth.registrar(req, 'Curso creado', `${datos.codigo} ${datos.nombre} sec. ${datos.seccion} (${datos.ciclo})`);
    res.status(201).json({ ok: true, id });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return errorCampos(res, { codigo: 'Ya existe ese curso con la misma sección y ciclo.' });
    throw err;
  }
});

api.put('/cursos/:id', (req, res) => {
  const id = validarId(req.params.id);
  const curso = id && cursos.porId(id);
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado.' });
  const { datos, errores } = validarCurso(req.body || {});
  if (!errores.docente_id && !docenteValido(datos.docente_id)) errores.docente_id = 'Seleccioná un catedrático activo.';
  const registrados = cursos.maximosRegistrados(id);
  for (const c of COMPONENTES) {
    if (!errores[`max_${c}`] && registrados[c] !== null && datos[`max_${c}`] < registrados[c]) {
      errores[`max_${c}`] = `Ya hay notas de ${registrados[c]} en ${NOMBRES_COMPONENTE[c]}.`;
    }
  }
  if (Object.keys(errores).length) return errorCampos(res, errores);
  try {
    cursos.actualizar(id, datos);
    auth.registrar(req, 'Curso editado', `${datos.codigo} sec. ${datos.seccion} (${datos.ciclo})`);
    res.json({ ok: true });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return errorCampos(res, { codigo: 'Ya existe ese curso con la misma sección y ciclo.' });
    throw err;
  }
});

api.delete('/cursos/:id', (req, res) => {
  const id = validarId(req.params.id);
  const curso = id && cursos.porId(id);
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado.' });
  cursos.eliminar(id);
  auth.registrar(req, 'Curso eliminado', `${curso.codigo} ${curso.nombre} sec. ${curso.seccion} (${curso.ciclo})`);
  res.json({ ok: true });
});

// ---------- Estudiantes asignados a un curso ----------
api.get('/cursos/:id/estudiantes', (req, res) => {
  const id = validarId(req.params.id);
  if (!id || !cursos.porId(id)) return res.status(404).json({ error: 'Curso no encontrado.' });
  res.json(asignaciones.estudiantesConNotas(id).map(({ id: eid, carne, nombre, activo }) => ({ id: eid, carne, nombre, activo })));
});

// Agrega estudiantes por carné (separados por espacios, comas o saltos de línea).
api.post('/cursos/:id/estudiantes', (req, res) => {
  const id = validarId(req.params.id);
  const curso = id && cursos.porId(id);
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado.' });
  const carnes = [...new Set(String((req.body && req.body.carnes) || '').split(/[\s,;]+/).filter(Boolean))];
  if (!carnes.length) return res.status(400).json({ error: 'Ingresá al menos un carné.' });
  if (carnes.length > MAX_LOTE) return res.status(400).json({ error: `Máximo ${MAX_LOTE} carnés por vez.` });

  const noEncontrados = [];
  const agregados = transaccion(() => {
    let n = 0;
    for (const carne of carnes) {
      const u = usuarios.buscarPorNombre(carne);
      if (!u || u.rol !== 'estudiante') { noEncontrados.push(carne); continue; }
      n += asignaciones.agregar(id, u.id);
    }
    return n;
  });
  if (agregados) auth.registrar(req, 'Estudiantes asignados', `${curso.codigo} sec. ${curso.seccion}: ${agregados}`);
  res.json({ agregados, noEncontrados });
});

api.delete('/cursos/:id/estudiantes/:eid', (req, res) => {
  const id = validarId(req.params.id);
  const eid = validarId(req.params.eid);
  const curso = id && cursos.porId(id);
  const est = eid && usuarios.buscarPorId(eid);
  if (!curso || !est || !asignaciones.quitar(id, eid)) return res.status(404).json({ error: 'Asignación no encontrada.' });
  auth.registrar(req, 'Estudiante retirado del curso', `${curso.codigo} sec. ${curso.seccion}: ${est.usuario}`);
  res.json({ ok: true });
});

// ---------- Bitácora ----------
api.get('/bitacora', (req, res) => {
  res.json(bitacora.recientes(300));
});

module.exports = api;
