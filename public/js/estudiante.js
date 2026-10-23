'use strict';
// Vista del estudiante: solo sus notas, y solo de cursos cuyo catedrático ya las publicó.

const COMPONENTES_EST = [
  { clave: 'p1', nombre: '1er parcial' },
  { clave: 'p2', nombre: '2do parcial' },
  { clave: 'act', nombre: 'Actividades' },
  { clave: 'final', nombre: 'Examen final' },
];
const CLASE_PROGRESO = { Aprobado: 'ok', Reprobado: 'mal', 'En curso': 'curso' };

// Barra del total sobre 100 con una marca en la nota mínima de aprobación.
// Los anchos se asignan por CSSOM (permitido por la CSP, a diferencia de style="..." en el HTML).
function barraProgreso(c) {
  const barra = crear('span', { class: `progreso__barra progreso__barra--${CLASE_PROGRESO[c.estado] || 'curso'}` });
  const meta = crear('span', { class: 'progreso__meta' }, crear('span', null, `Aprueba con ${sesion.notaAprobacion}`));
  meta.style.left = `${Math.min(sesion.notaAprobacion, 100)}%`;
  requestAnimationFrame(() => requestAnimationFrame(() => { barra.style.width = `${Math.min(c.total || 0, 100)}%`; }));
  return crear('div', { class: 'progreso', role: 'img', 'aria-label': `Total ${formatoNota(c.total)} de 100` }, barra, meta);
}

function tarjetaCurso(c) {
  const cabecera = crear('div', { class: 'meta' },
    crear('span', { class: 'categoria' }, c.codigo),
    crear('span', null, `Sección ${c.seccion} · ${c.ciclo}`),
    c.docente ? crear('span', null, `· ${c.docente}`) : null);

  if (!c.notas_publicadas) {
    return crear('article', { class: 'curso-notas curso-notas--pendiente' }, cabecera,
      crear('h2', null, c.nombre),
      crear('p', { class: 'vacio' }, 'Las notas de este curso aún no han sido publicadas.'));
  }
  return crear('article', { class: 'curso-notas' }, cabecera,
    crear('div', { class: 'curso-notas__titulo' }, crear('h2', null, c.nombre), pillEstado(c.estado)),
    barraProgreso(c),
    crear('dl', { class: 'desglose' },
      ...COMPONENTES_EST.flatMap((k) => [
        crear('dt', null, k.nombre),
        crear('dd', null, crear('strong', null, formatoNota(c[k.clave])), ` / ${c[`max_${k.clave}`]}`)]),
      crear('dt', { class: 'desglose__total' }, 'Total'),
      crear('dd', { class: 'desglose__total' }, crear('strong', null, formatoNota(c.total)), ' / 100')),
    c.publicado_en ? crear('p', { class: 'campo__ayuda' }, `Publicado: ${c.publicado_en}`) : null);
}

function dato(valor, etiqueta) {
  return crear('div', { class: 'dato' }, crear('strong', null, String(valor)), crear('span', null, etiqueta));
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
  try {
    const s = await iniciarPortal();
    const primerNombre = (s.nombre || '').split(' ')[0];
    document.getElementById('saludo').textContent = primerNombre ? `Hola, ${primerNombre}` : 'Hola';
    document.getElementById('info-estudiante').textContent = `Carné ${s.usuario} · Aprobación con ${s.notaAprobacion} puntos`;

    const cursos = await api('estudiante/notas');
    const publicados = cursos.filter((c) => c.notas_publicadas);
    const completos = publicados.filter((c) => c.estado !== 'En curso');
    const promedio = completos.length
      ? formatoNota(completos.reduce((suma, c) => suma + c.total, 0) / completos.length)
      : '–';
    document.getElementById('resumen-estudiante').replaceChildren(
      dato(`${publicados.length}/${cursos.length}`, 'cursos publicados'),
      dato(completos.filter((c) => c.estado === 'Aprobado').length, 'aprobados'),
      dato(promedio, 'promedio'));

    document.getElementById('lista-notas').replaceChildren(...(cursos.length
      ? cursos.map(tarjetaCurso)
      : [crear('p', { class: 'vacio' }, 'No tenés cursos asignados.')]));
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
});
