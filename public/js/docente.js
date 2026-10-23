'use strict';
// Panel del catedrático: ingreso de notas por curso y publicación para los estudiantes.

const COMPONENTES = [
  { clave: 'p1', nombre: '1er parcial' },
  { clave: 'p2', nombre: '2do parcial' },
  { clave: 'act', nombre: 'Actividades' },
  { clave: 'final', nombre: 'Examen final' },
];
const PATRON_NOTA = /^\d{1,3}(\.\d{1,2})?$/;

let cursoActual = null;
let sinGuardar = false;

const $ = (id) => document.getElementById(id);

function vista(notas) {
  $('vista-cursos').hidden = notas;
  $('vista-notas').hidden = !notas;
  window.scrollTo(0, 0);
}

// ---------- Mis cursos ----------
function dato(valor, etiqueta) {
  return crear('div', { class: 'dato' }, crear('strong', null, String(valor)), crear('span', null, etiqueta));
}

async function cargarCursos() {
  const cursos = await api('docente/cursos');
  $('resumen-docente').replaceChildren(
    dato(cursos.length, 'cursos'),
    dato(cursos.reduce((s, c) => s + c.estudiantes, 0), 'estudiantes'),
    dato(cursos.filter((c) => c.notas_publicadas).length, 'publicados'));
  $('lista-cursos').replaceChildren(...(cursos.length
    ? cursos.map((c) => {
      const abrir = boton('Ingresar notas →', 'boton--rojo boton--chico', () => abrirCurso(c.id));
      return crear('article', { class: `tarjeta tarjeta--curso${c.notas_publicadas ? ' tarjeta--publicada' : ''}` },
        crear('div', { class: 'tarjeta__cuerpo' },
          crear('div', { class: 'meta' },
            crear('span', { class: 'categoria' }, c.codigo),
            crear('span', null, `Sección ${c.seccion} · ${c.ciclo}`)),
          crear('h2', { class: 'tarjeta__titulo' }, c.nombre),
          crear('p', { class: 'tarjeta__resumen' }, `${c.estudiantes} estudiante(s)`),
          crear('div', { class: 'tarjeta__pie' },
            crear('span', { class: `estado-pill estado-pill--${c.notas_publicadas ? 'publicado' : 'borrador'}` },
              c.notas_publicadas ? 'Notas publicadas' : 'Sin publicar'),
            abrir)));
    })
    : [crear('p', { class: 'vacio' }, 'No tenés cursos asignados. Solicitá a la administración que te asigne.')]));
}

// ---------- Notas de un curso ----------
function leerFila(tr) {
  const fila = { id: Number(tr.dataset.id) };
  for (const { clave } of COMPONENTES) fila[clave] = tr.querySelector(`[data-comp="${clave}"]`).value.trim();
  return fila;
}

// Valida una celda y devuelve el número (o null si está vacía); marca la celda si es inválida.
function valorCelda(input, max) {
  const s = input.value.trim().replace(',', '.');
  if (s !== input.value.trim()) input.value = s;
  const ok = s === '' || (PATRON_NOTA.test(s) && Number(s) <= max);
  input.classList.toggle('celda--invalida', !ok);
  input.setAttribute('aria-invalid', String(!ok));
  return ok ? (s === '' ? null : Number(s)) : undefined;
}

function recalcularFila(tr) {
  let total = 0;
  let completo = true;
  let valido = true;
  for (const { clave } of COMPONENTES) {
    const v = valorCelda(tr.querySelector(`[data-comp="${clave}"]`), cursoActual[`max_${clave}`]);
    if (v === undefined) valido = false;
    else if (v === null) completo = false;
    else total += v;
  }
  total = Math.round(total * 100) / 100;
  tr.querySelector('.total').textContent = valido ? String(total) : '?';
  const estado = !valido ? '—' : !completo ? 'En curso' : total >= sesion.notaAprobacion ? 'Aprobado' : 'Reprobado';
  tr.querySelector('.estado').replaceChildren(estado === '—' ? '—' : pillEstado(estado));
  return { valido, completo, total, estado };
}

function actualizarResumen() {
  const filas = [...$('tabla-notas').querySelectorAll('tr[data-id]')].map(recalcularFila);
  const cuenta = (e) => filas.filter((f) => f.estado === e).length;
  const completos = filas.filter((f) => f.valido && f.completo);
  const promedio = completos.length ? Math.round((completos.reduce((s, f) => s + f.total, 0) / completos.length) * 100) / 100 : '–';
  $('resumen-notas').replaceChildren(
    crear('div', null, crear('strong', null, String(filas.length)), ' estudiantes'),
    crear('div', null, crear('strong', null, String(cuenta('Aprobado'))), ' aprobados'),
    crear('div', null, crear('strong', null, String(cuenta('Reprobado'))), ' reprobados'),
    crear('div', null, crear('strong', null, String(cuenta('En curso'))), ' en curso'),
    crear('div', null, crear('strong', null, String(promedio)), ' promedio (notas completas)'));
}

function pintarPublicacion() {
  const c = cursoActual;
  $('estado-publicacion').replaceChildren(crear('span', { class: `estado-pill estado-pill--${c.notas_publicadas ? 'publicado' : 'borrador'}` },
    c.notas_publicadas ? `Publicadas${c.publicado_en ? ` el ${c.publicado_en}` : ''}` : 'Sin publicar: los estudiantes no las ven'));
  $('btn-publicar').textContent = c.notas_publicadas ? 'Retirar publicación' : 'Publicar notas a estudiantes';
}

function marcarSinGuardar(valor) {
  sinGuardar = valor;
  $('btn-guardar').textContent = valor ? 'Guardar notas *' : 'Guardar notas';
}

async function abrirCurso(id) {
  mostrarMensaje('');
  try {
    const { curso, estudiantes } = await api(`docente/cursos/${id}`);
    cursoActual = curso;
    $('t-curso').textContent = `${curso.codigo} ${curso.nombre}`;
    $('info-curso').textContent = `Sección ${curso.seccion} · ${curso.ciclo} · Punteo: `
      + COMPONENTES.map((k) => `${k.nombre} ${curso[`max_${k.clave}`]}`).join(', ')
      + ` · Aprobación: ${sesion.notaAprobacion}`;
    $('encabezado-notas').replaceChildren(
      crear('th', null, 'Carné'), crear('th', null, 'Estudiante'),
      ...COMPONENTES.map((k) => crear('th', null, `${k.nombre} (${curso[`max_${k.clave}`]})`)),
      crear('th', null, 'Total'), crear('th', null, 'Estado'));
    $('tabla-notas').replaceChildren(...(estudiantes.length
      ? estudiantes.map((e) => crear('tr', { 'data-id': String(e.id) },
        crear('td', { 'data-col': 'Carné' }, e.carne),
        crear('td', { 'data-col': 'Estudiante' }, e.nombre),
        ...COMPONENTES.map((k) => crear('td', { 'data-col': `${k.nombre} (${curso[`max_${k.clave}`]})` },
          crear('input', {
            type: 'text', inputmode: 'decimal', class: 'celda', 'data-comp': k.clave, maxlength: '6',
            value: e[k.clave] === null ? '' : String(e[k.clave]),
            'aria-label': `${k.nombre} de ${e.nombre}`,
          }))),
        crear('td', { 'data-col': 'Total', class: 'total' }),
        crear('td', { 'data-col': 'Estado', class: 'estado' })))
      : [crear('tr', null, crear('td', { colspan: '8', class: 'vacio' }, 'Este curso aún no tiene estudiantes asignados.'))]));
    $('btn-guardar').disabled = !estudiantes.length;
    pintarPublicacion();
    actualizarResumen();
    marcarSinGuardar(false);
    vista(true);
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

async function guardarNotas(e) {
  e.preventDefault();
  const trs = [...$('tabla-notas').querySelectorAll('tr[data-id]')];
  if (trs.map(recalcularFila).some((f) => !f.valido)) {
    mostrarMensaje('Hay notas inválidas (marcadas en rojo). Revisá el máximo de cada columna.', 'error');
    const primera = $('tabla-notas').querySelector('.celda--invalida');
    if (primera) primera.focus();
    return;
  }
  $('btn-guardar').disabled = true;
  try {
    const r = await api(`docente/cursos/${cursoActual.id}/notas`, { method: 'PUT', body: { notas: trs.map(leerFila) } });
    marcarSinGuardar(false);
    mostrarMensaje(r.modificados ? `Notas guardadas (${r.modificados} estudiante(s) con cambios).` : 'No había cambios por guardar.', 'ok');
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  } finally {
    $('btn-guardar').disabled = false;
  }
}

async function alternarPublicacion() {
  if (sinGuardar) return mostrarMensaje('Guardá las notas antes de publicar o retirar la publicación.', 'error');
  const publicar = !cursoActual.notas_publicadas;
  const pregunta = publicar
    ? '¿Publicar las notas? Cada estudiante del curso podrá ver las suyas en el portal.'
    : '¿Retirar la publicación? Los estudiantes dejarán de ver las notas de este curso.';
  if (!confirm(pregunta)) return;
  try {
    await api(`docente/cursos/${cursoActual.id}/publicacion`, { method: 'POST', body: { publicar } });
    await abrirCurso(cursoActual.id);
    mostrarMensaje(publicar ? 'Notas publicadas.' : 'Publicación retirada.', 'ok');
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const s = await iniciarPortal();
    const primerNombre = (s.nombre || '').split(' ')[0];
    $('saludo').textContent = primerNombre ? `Hola, ${primerNombre}` : 'Hola';
    await cargarCursos();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
    return;
  }
  $('form-notas').addEventListener('submit', guardarNotas);
  $('form-notas').addEventListener('input', (e) => {
    if (!e.target.classList.contains('celda')) return;
    marcarSinGuardar(true);
    actualizarResumen();
  });
  $('btn-publicar').addEventListener('click', alternarPublicacion);
  $('btn-volver').addEventListener('click', async () => {
    if (sinGuardar && !confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) return;
    marcarSinGuardar(false);
    vista(false);
    mostrarMensaje('');
    await cargarCursos().catch((err) => mostrarMensaje(err.message, 'error'));
  });
  window.addEventListener('beforeunload', (e) => { if (sinGuardar) e.preventDefault(); });
});
