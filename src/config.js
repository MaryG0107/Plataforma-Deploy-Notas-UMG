'use strict';
const path = require('node:path');
const crypto = require('node:crypto');

const RAIZ = path.resolve(__dirname, '..');

// Carga .env si existe (sin dependencias externas).
try {
  process.loadEnvFile(path.join(RAIZ, '.env'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

function entero(valor, porDefecto) {
  const n = Number.parseInt(valor, 10);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

function proxyDeConfianza(valor) {
  if (valor === undefined || valor === '') return 'loopback';
  if (valor === 'false') return false;
  if (valor === 'true') return true;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor;
}

let secreto = process.env.SESSION_SECRET || '';
if (secreto.length < 32) {
  console.warn('[aviso] SESSION_SECRET falta o es corto (<32). Se usará uno temporal: las sesiones se perderán al reiniciar.');
  secreto = crypto.randomBytes(32).toString('hex');
}

module.exports = {
  RAIZ,
  host: process.env.HOST || '127.0.0.1',
  puerto: entero(process.env.PORT, 3000),
  secretoSesion: secreto,
  minutosSesion: entero(process.env.SESSION_MINUTES, 120),
  cookieSegura: process.env.COOKIE_SECURE === 'true',
  trustProxy: proxyDeConfianza(process.env.TRUST_PROXY),
  rutaBD: path.resolve(RAIZ, process.env.DB_PATH || 'data/sitio.db'),
  adminUsuario: (process.env.ADMIN_USER || '').trim(),
  adminClave: process.env.ADMIN_PASSWORD || '',
  notaAprobacion: entero(process.env.NOTA_APROBACION, 61),
};
