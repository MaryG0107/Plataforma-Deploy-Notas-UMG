'use strict';
// Pestaña "Cursos": creación de cursos, catedrático asignado, punteos y estudiantes.

const CUR_COMPONENTES = ['max_p1', 'max_p2', 'max_act', 'max_final'];
let curLista = [];
let curEditandoId = null;
let curActual = null;

function curVista(nombre) {
  document.getElementById('cur-lista').hidden = nombre !== 'lista';
  document.getElementById('cur-form-vista').hidden = nombre !== 'form';
  document.getElementById('cur-estudiantes-vista').hidden = nombre !== 'estudiantes';
  window.scrollTo(0, 0);
}

function curFila(c) {
  return crear('tr', null,
    crear('td', { 'data-col': 'Curso' }, crear('strong', null, c.codigo), ` ${c.nombre}`),
    crear('td', { 'data-col': 'Sección' }, c.seccion),
    crear('td', { 'data-col': 'Ciclo' }, c.ciclo),
    crear('td', { 'data-col': 'Catedrático' }, c.docente || crear('em', null, 'Sin asignar')),
    crear('td', { 'data-col': 'Estudiantes' }, String(c.estudiantes)),
    crear('td', { 'data-col': 'Notas' },
      crear('span', { class: `estado-pill estado-pill--${c.notas_publicadas ? 'publicado' : 'borrador'}` },
        c.notas_publicadas ? 'Publicadas' : 'Sin publicar')),
    crear('td', { class: 'acciones' },
      boton('Estudiantes', 'boton--claro boton--borde boton--chico', () => curAbrirEstudiantes(c)),
      boton('Editar', 'boton--claro boton--borde boton--chico', () => curAbrirFormulario(c)),
      boton('Eliminar', 'boton--peligro boton--chico', () => curEliminar(c))));
}

async function curCargar() {
  curLista = await api('gestion/cursos');
  document.getElementById('cur-tabla').replaceChildren(...(curLista.length
    ? curLista.map(curFila)
    : [crear('tr', null, crear('td', { colspan: '7', class: 'vacio' }, 'Todavía no hay cursos.'))]));
}

async function curCargarDocentes(seleccionado) {
  const docentes = (await api('gestion/usuarios?rol=docente')).filter((d) => d.activo || d.id === seleccionado);
  document.getElementById('cur-docente').replaceChildren(
    crear('option', { value: '' }, docentes.length ? 'Sin asignar' : 'Sin asignar (no hay catedráticos creados)'),
    ...docentes.map((d) => crear('option', { value: String(d.id) }, `${d.nombre || d.usuario} (${d.usuario})`)));
  document.getElementById('cur-docente').value = seleccionado ? String(seleccionado) : '';
}

function curSuma() {
  const form = document.getElementById('cur-form');
  const suma = CUR_COMPONENTES.reduce((s, c) => s + (Number(form[c].value) || 0), 0);
  const nodo = document.getElementById('cur-suma');
  nodo.textContent = `Suma actual: ${Math.round(suma * 100) / 100} / 100`;
  nodo.classList.toggle('campo__error', Math.abs(suma - 100) > 0.001);
}

async function curAbrirFormulario(c) {
  const form = document.getElementById('cur-form');
  form.reset();
  limpiarErrores(form);
  mostrarMensaje('');
  curEditandoId = c ? c.id : null;
  document.getElementById('cur-form-titulo').textContent = c ? `Editar curso ${c.codigo}` : 'Nuevo curso';
  if (c) {
    for (const campo of ['codigo', 'nombre', 'seccion', 'ciclo', ...CUR_COMPONENTES]) form[campo].value = c[campo];
  }
  try {
    await curCargarDocentes(c ? c.docente_id : null);
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
  curSuma();
  curVista('form');
  form.codigo.focus();
}

async function curEnviar(e) {
  e.preventDefault();
  const form = e.target;
  limpiarErrores(form);
  const datos = {};
  for (const campo of ['codigo', 'nombre', 'seccion', 'ciclo', 'docente_id', ...CUR_COMPONENTES]) datos[campo] = form[campo].value.trim();
  const errores = {};
  if (!/^[A-Za-z0-9-]{2,20}$/.test(datos.codigo)) errores.codigo = 'De 2 a 20 caracteres: letras, números o guion.';
  if (datos.nombre.length < 3) errores.nombre = 'Debe tener al menos 3 caracteres.';
  if (!/^[A-Za-z0-9]{1,5}$/.test(datos.seccion)) errores.seccion = 'De 1 a 5 letras o números.';
  if (datos.ciclo.length < 3) errores.ciclo = 'Debe tener al menos 3 caracteres.';
  const suma = CUR_COMPONENTES.reduce((s, c) => s + (Number(datos[c]) || 0), 0);
  if (Math.abs(suma - 100) > 0.001) errores.max_final = 'La suma de los punteos debe ser 100.';
  if (Object.keys(errores).length) {
    mostrarMensaje('Revisá los campos marcados.', 'error');
    return marcarErrores(form, errores);
  }
  try {
    await api(curEditandoId ? `gestion/cursos/${curEditandoId}` : 'gestion/cursos', {
      method: curEditandoId ? 'PUT' : 'POST', body: datos,
    });
    await curCargar();
    curVista('lista');
    mostrarMensaje('Curso guardado.', 'ok');
  } catch (err) {
    mostrarMensaje(err.message, 'error');
    marcarErrores(form, err.errores);
  }
}

async function curEliminar(c) {
  const aviso = c.estudiantes
    ? `¿Eliminar ${c.codigo} sección ${c.seccion}? Se borrarán también sus ${c.estudiantes} asignaciones y todas sus notas.`
    : `¿Eliminar ${c.codigo} sección ${c.seccion}?`;
  if (!confirm(aviso)) return;
  try {
    await api(`gestion/cursos/${c.id}`, { method: 'DELETE' });
    mostrarMensaje('Curso eliminado.', 'ok');
    await curCargar();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

// ---------- Estudiantes del curso ----------
async function curPintarEstudiantes() {
  const lista = await api(`gestion/cursos/${curActual.id}/estudiantes`);
  document.getElementById('cur-estudiantes-titulo').textContent =
    `${curActual.codigo} ${curActual.nombre} · Sección ${curActual.seccion} · ${lista.length} estudiante(s)`;
  document.getElementById('cur-estudiantes-tabla').replaceChildren(...(lista.length
    ? lista.map((e) => crear('tr', null,
      crear('td', { 'data-col': 'Carné' }, e.carne),
      crear('td', { 'data-col': 'Nombre' }, e.nombre, e.activo ? null : crear('em', null, ' (inactivo)')),
      crear('td', { class: 'acciones' }, boton('Quitar', 'boton--peligro boton--chico', () => curQuitar(e)))))
    : [crear('tr', null, crear('td', { colspan: '3', class: 'vacio' }, 'Sin estudiantes asignados.'))]));
}

async function curAbrirEstudiantes(c) {
  curActual = c;
  mostrarMensaje('');
  document.getElementById('cur-carnes').value = '';
  try {
    await curPintarEstudiantes();
    curVista('estudiantes');
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

async function curAsignar(e) {
  e.preventDefault();
  const carnes = document.getElementById('cur-carnes').value.trim();
  if (!carnes) return mostrarMensaje('Ingresá al menos un carné.', 'error');
  try {
    const r = await api(`gestion/cursos/${curActual.id}/estudiantes`, { method: 'POST', body: { carnes } });
    const faltan = r.noEncontrados.length ? ` No encontrados (o no son estudiantes): ${r.noEncontrados.join(', ')}.` : '';
    mostrarMensaje(`${r.agregados} estudiante(s) agregado(s).${faltan}`, r.noEncontrados.length ? 'error' : 'ok');
    document.getElementById('cur-carnes').value = r.noEncontrados.join('\n');
    await curPintarEstudiantes();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

async function curQuitar(est) {
  if (!confirm(`¿Quitar a ${est.nombre} (${est.carne}) del curso? Se borrarán sus notas en este curso.`)) return;
  try {
    await api(`gestion/cursos/${curActual.id}/estudiantes/${est.id}`, { method: 'DELETE' });
    mostrarMensaje('Estudiante retirado del curso.', 'ok');
    await curPintarEstudiantes();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

async function iniciarCursos() {
  document.getElementById('cur-nuevo').addEventListener('click', () => curAbrirFormulario(null));
  document.getElementById('cur-cancelar').addEventListener('click', () => { curVista('lista'); mostrarMensaje(''); });
  document.getElementById('cur-form').addEventListener('submit', curEnviar);
  document.getElementById('cur-form').addEventListener('input', (e) => { if (CUR_COMPONENTES.includes(e.target.name)) curSuma(); });
  document.getElementById('cur-asignar').addEventListener('submit', curAsignar);
  document.getElementById('cur-volver').addEventListener('click', async () => {
    curVista('lista');
    mostrarMensaje('');
    await curCargar();
  });
  await curCargar();
}
