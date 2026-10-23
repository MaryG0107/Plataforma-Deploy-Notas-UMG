'use strict';
// Validaciones del servidor. Devuelven { datos, errores } con errores como objeto campo -> mensaje.
const { ROLES } = require('./db');

function texto(valor) {
  // Quita caracteres de control (excepto saltos de línea y tabulaciones) y espacios extremos.
  return typeof valor === 'string' ? valor.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim() : '';
}

function validarId(valor) {
  const n = Number(valor);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ---- Usuarios ----
const PATRON_USUARIO = /^[A-Za-z0-9._-]{3,50}$/;

function validarNombre(valor) {
  const nombre = texto(valor).replace(/\s+/g, ' ');
  return nombre.length >= 3 && nombre.length <= 100 ? nombre : null;
}

function validarUsuario(cuerpo) {
  const datos = {
    usuario: texto(cuerpo.usuario),
    nombre: validarNombre(cuerpo.nombre),
    rol: texto(cuerpo.rol),
  };
  const errores = {};
  if (!PATRON_USUARIO.test(datos.usuario)) errores.usuario = 'De 3 a 50 caracteres: letras, números, punto, guion o guion bajo.';
  if (!datos.nombre) errores.nombre = 'El nombre debe tener entre 3 y 100 caracteres.';
  if (!ROLES.includes(datos.rol)) errores.rol = 'Seleccioná un rol válido.';
  return { datos, errores };
}

// ---- Cursos ----
const COMPONENTES = ['p1', 'p2', 'act', 'final'];

// Número entre 0 y max con hasta 2 decimales. Vacío = null (nota no ingresada).
function numeroNota(valor, max) {
  if (valor === null || valor === undefined || valor === '') return { valor: null };
  const s = String(valor).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return { error: true };
  const n = Number(s);
  return n <= max ? { valor: n } : { error: true };
}

function validarCurso(cuerpo) {
  const datos = {
    codigo: texto(cuerpo.codigo).toUpperCase(),
    nombre: texto(cuerpo.nombre),
    seccion: texto(cuerpo.seccion).toUpperCase(),
    ciclo: texto(cuerpo.ciclo),
    docente_id: cuerpo.docente_id ? validarId(cuerpo.docente_id) : null,
  };
  const errores = {};
  if (!/^[A-Z0-9-]{2,20}$/.test(datos.codigo)) errores.codigo = 'De 2 a 20 caracteres: letras, números o guion.';
  if (datos.nombre.length < 3 || datos.nombre.length > 120) errores.nombre = 'Debe tener entre 3 y 120 caracteres.';
  if (!/^[A-Z0-9]{1,5}$/.test(datos.seccion)) errores.seccion = 'De 1 a 5 letras o números.';
  if (datos.ciclo.length < 3 || datos.ciclo.length > 40) errores.ciclo = 'Debe tener entre 3 y 40 caracteres.';
  if (cuerpo.docente_id && !datos.docente_id) errores.docente_id = 'Catedrático no válido.';

  let suma = 0;
  for (const c of COMPONENTES) {
    const r = numeroNota(cuerpo[`max_${c}`], 100);
    if (r.error || r.valor === null) errores[`max_${c}`] = 'Valor entre 0 y 100.';
    else { datos[`max_${c}`] = r.valor; suma += r.valor; }
  }
  if (!COMPONENTES.some((c) => errores[`max_${c}`]) && Math.abs(suma - 100) > 0.001) {
    errores.max_final = `La suma de los punteos debe ser 100 (actual: ${Math.round(suma * 100) / 100}).`;
  }
  return { datos, errores };
}

// ---- Notas ----
function validarNotas(fila, curso) {
  const datos = {};
  const errores = [];
  for (const c of COMPONENTES) {
    const r = numeroNota(fila[c], curso[`max_${c}`]);
    if (r.error) errores.push(c);
    else datos[c] = r.valor;
  }
  return { datos, errores };
}

module.exports = {
  validarId, validarUsuario, validarNombre, validarCurso, validarNotas,
  texto, COMPONENTES, PATRON_USUARIO,
};
