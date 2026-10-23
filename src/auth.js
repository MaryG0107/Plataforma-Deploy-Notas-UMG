'use strict';
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { usuarios, bitacora } = require('./db');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 16384, r: 8, p: 1 };
const LARGO_CLAVE = 64;
const LARGO_MINIMO_CLAVE = 12;

// ---- Hash de contraseñas (scrypt con sal aleatoria) ----
async function hashear(clave) {
  const sal = crypto.randomBytes(16);
  const derivada = await scrypt(clave, sal, LARGO_CLAVE, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64')}$${derivada.toString('base64')}`;
}

async function verificar(clave, almacenado) {
  const partes = String(almacenado).split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, 'base64');
  const derivada = await scrypt(clave, Buffer.from(salB64, 'base64'), esperado.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return crypto.timingSafeEqual(derivada, esperado);
}

// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real.
let hashFicticio = null;
async function verificarCredenciales(usuario, clave) {
  const fila = usuarios.buscarPorNombre(usuario);
  if (!fila) {
    hashFicticio = hashFicticio || (await hashear(crypto.randomBytes(16).toString('hex')));
    await verificar(clave, hashFicticio);
    return null;
  }
  return (await verificar(clave, fila.hash)) && fila.activo ? fila : null;
}

// ---- Cuenta inicial desde variables de entorno ----
// Se crea mientras no exista ningún administrador (aunque ya haya catedráticos o estudiantes).
async function crearAdminInicial() {
  if (usuarios.listar('admin').length > 0) return;
  const { adminUsuario, adminClave } = config;
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(adminUsuario) || adminClave.length < LARGO_MINIMO_CLAVE) {
    console.warn(
      `[aviso] No hay administrador. Definí ADMIN_USER (3-50 caracteres: letras, números, . _ -) y ADMIN_PASSWORD (mínimo ${LARGO_MINIMO_CLAVE} caracteres; ahora tiene ${adminClave.length}) en .env y reiniciá.`
    );
    return;
  }
  if (usuarios.buscarPorNombre(adminUsuario)) {
    console.warn(`[aviso] El usuario "${adminUsuario}" ya existe con otro rol. Elegí otro ADMIN_USER en .env y reiniciá.`);
    return;
  }
  usuarios.crear({ usuario: adminUsuario, nombre: 'Administrador', rol: 'admin', hash: await hashear(adminClave) });
  console.log(`[info] Cuenta administradora "${adminUsuario}" creada. Borrá ADMIN_PASSWORD del archivo .env.`);
}

// Contraseña temporal legible (sin caracteres ambiguos como 0/O o 1/l).
function claveTemporal() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let clave = '';
  for (let i = 0; i < 12; i++) clave += alfabeto[crypto.randomInt(alfabeto.length)];
  return clave;
}

// ---- Bitácora ----
function registrar(req, accion, detalle) {
  const usuario = req.usuario ? req.usuario.usuario : (req.session && req.session.usuario);
  bitacora.registrar(usuario, req.ip, accion, detalle);
}

// ---- Protección de rutas ----
// Carga el usuario de la sesión; si fue desactivado o eliminado, la sesión deja de valer.
function usuarioDeSesion(req) {
  const id = req.session && req.session.usuarioId;
  const fila = id && usuarios.buscarPorId(id);
  return fila && fila.activo ? fila : null;
}

function requiereSesionApi(req, res, next) {
  req.usuario = usuarioDeSesion(req);
  if (req.usuario) return next();
  res.status(401).json({ error: 'Sesión no válida o expirada.' });
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (req.usuario && roles.includes(req.usuario.rol)) return next();
    res.status(403).json({ error: 'No tenés permiso para esta acción.' });
  };
}

// Mientras la contraseña sea temporal, solo se permite cambiarla.
function exigeClaveDefinitiva(req, res, next) {
  if (!req.usuario.debe_cambiar) return next();
  res.status(403).json({ error: 'Debés cambiar tu contraseña temporal.', debeCambiar: true });
}

// ---- CSRF: token por sesión enviado en la cabecera X-CSRF-Token ----
function tokenCsrf(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function verificarCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const enviado = Buffer.from(String(req.get('X-CSRF-Token') || ''));
  const esperado = Buffer.from(String(req.session.csrf || ''));
  if (esperado.length > 0 && enviado.length === esperado.length && crypto.timingSafeEqual(enviado, esperado)) {
    return next();
  }
  res.status(403).json({ error: 'Token de seguridad inválido. Recargá la página.' });
}

// ---- Límite de intentos de inicio de sesión (en memoria) ----
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;
const intentos = new Map();

function claveIntento(req, usuario) {
  return `${req.ip}|${String(usuario).toLowerCase()}`;
}

function estaBloqueado(req, usuario) {
  const r = intentos.get(claveIntento(req, usuario));
  return Boolean(r && r.hasta && r.hasta > Date.now());
}

function registrarFallo(req, usuario) {
  const k = claveIntento(req, usuario);
  const r = intentos.get(k) || { fallos: 0, hasta: 0 };
  r.fallos += 1;
  if (r.fallos >= MAX_INTENTOS) {
    r.hasta = Date.now() + BLOQUEO_MS;
    r.fallos = 0;
  }
  intentos.set(k, r);
}

function limpiarFallos(req, usuario) {
  intentos.delete(claveIntento(req, usuario));
}

setInterval(() => {
  const ahora = Date.now();
  for (const [k, r] of intentos) if (!r.hasta || r.hasta < ahora) intentos.delete(k);
}, BLOQUEO_MS).unref();

module.exports = {
  LARGO_MINIMO_CLAVE,
  hashear,
  verificar,
  verificarCredenciales,
  crearAdminInicial,
  claveTemporal,
  registrar,
  requiereSesionApi,
  usuarioDeSesion,
  requiereRol,
  exigeClaveDefinitiva,
  tokenCsrf,
  verificarCsrf,
  estaBloqueado,
  registrarFallo,
  limpiarFallos,
};
