'use strict';
// Utilidades de la plataforma. Las rutas son relativas para funcionar por IP o dominio.

let csrfToken = '';
let sesion = null;

async function api(ruta, opciones = {}) {
  const cabeceras = { Accept: 'application/json', 'X-CSRF-Token': csrfToken, ...(opciones.headers || {}) };
  let cuerpo = opciones.body;
  if (cuerpo && !(cuerpo instanceof FormData)) {
    cabeceras['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(cuerpo);
  }
  const r = await fetch(`api/${ruta}`, {
    method: opciones.method || 'GET',
    headers: cabeceras,
    body: cuerpo,
    credentials: 'same-origin',
  });
  let datos = {};
  try { datos = await r.json(); } catch { /* respuesta sin JSON */ }
  if (r.status === 401 && ruta !== 'login') {
    location.href = './';
    throw new Error('Sesión expirada.');
  }
  if (r.status === 403 && datos.debeCambiar) {
    location.href = './';
    throw new Error(datos.error);
  }
  if (!r.ok) {
    const err = new Error(datos.error || `Error ${r.status}`);
    Object.assign(err, datos);
    err.errores = datos.errores || {};
    throw err;
  }
  return datos;
}

function mostrarMensaje(texto, tipo) {
  const m = document.getElementById('mensaje');
  if (!m) return;
  m.textContent = texto;
  m.className = `mensaje${tipo ? ` mensaje--${tipo}` : ''}`;
}

function crear(etiqueta, atributos, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (k === 'class') nodo.className = v;
    else if (v !== false && v !== null && v !== undefined) nodo.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos) if (h !== null && h !== undefined && h !== false) nodo.append(h);
  return nodo;
}

function boton(texto, clase, alHacerClic) {
  const b = crear('button', { class: `boton ${clase}`, type: 'button' }, texto);
  b.addEventListener('click', alHacerClic);
  return b;
}

// Errores por campo dentro de un formulario: <p data-error="campo"> junto a cada control.
function limpiarErrores(form) {
  form.querySelectorAll('[data-error]').forEach((n) => { n.textContent = ''; });
  form.querySelectorAll('.campo--invalido').forEach((n) => n.classList.remove('campo--invalido'));
}

function marcarErrores(form, errores) {
  for (const [campo, msg] of Object.entries(errores || {})) {
    const nodo = form.querySelector(`[data-error="${campo}"]`);
    if (!nodo) continue;
    nodo.textContent = msg;
    nodo.closest('.campo').classList.add('campo--invalido');
  }
  const primero = form.querySelector('.campo--invalido input, .campo--invalido select, .campo--invalido textarea');
  if (primero) primero.focus();
}

// Muestra un número de nota; vacío si no fue ingresada.
function formatoNota(v) {
  return v === null || v === undefined ? '–' : String(Math.round(v * 100) / 100);
}

function pillEstado(estado) {
  const clase = { Aprobado: 'publicado', Reprobado: 'reprobado', 'En curso': 'borrador' }[estado] || 'borrador';
  return crear('span', { class: `estado-pill estado-pill--${clase}` }, estado);
}

// Contraseñas temporales: se muestran una sola vez para que el administrador las entregue.
function mostrarClaves(filas, contenedorId = 'claves-temporales') {
  const caja = document.getElementById(contenedorId);
  if (!caja || !filas.length) return;
  const texto = filas.map((f) => `${f.usuario}\t${f.nombre || ''}\t${f.clave}`).join('\n');
  const copiar = boton('Copiar todo', 'boton--claro boton--borde boton--chico', async () => {
    try { await navigator.clipboard.writeText(texto); copiar.textContent = 'Copiado'; } catch { copiar.textContent = 'Seleccioná y copiá manualmente'; }
  });
  caja.replaceChildren(
    crear('h2', null, 'Contraseñas temporales'),
    crear('p', null, 'Copialas y entregalas de forma privada. No se volverán a mostrar; cada persona deberá cambiarla al ingresar.'),
    crear('div', { class: 'tabla-envoltura' },
      crear('table', { class: 'tabla' },
        crear('thead', null, crear('tr', null, crear('th', null, 'Usuario / carné'), crear('th', null, 'Nombre'), crear('th', null, 'Contraseña temporal'))),
        crear('tbody', null, ...filas.map((f) => crear('tr', null,
          crear('td', { 'data-col': 'Usuario' }, f.usuario),
          crear('td', { 'data-col': 'Nombre' }, f.nombre || ''),
          crear('td', { 'data-col': 'Contraseña' }, crear('code', null, f.clave))))))),
    crear('div', { class: 'formulario__acciones' }, copiar,
      boton('Ya las copié, ocultar', 'boton--rojo boton--chico', () => { caja.hidden = true; caja.replaceChildren(); })));
  caja.hidden = false;
  caja.scrollIntoView({ behavior: 'smooth' });
}

// Carga la sesión y conecta la barra superior y el formulario "Cambiar mi contraseña" si existen.
async function iniciarPortal() {
  sesion = await api('sesion');
  csrfToken = sesion.csrf;
  const etiqueta = document.getElementById('usuario-actual');
  if (etiqueta) etiqueta.textContent = sesion.nombre || sesion.usuario;

  const salir = document.getElementById('btn-salir');
  if (salir) {
    salir.addEventListener('click', async () => {
      try { await api('logout', { method: 'POST' }); } finally { location.href = './'; }
    });
  }

  const formClave = document.getElementById('form-clave');
  if (formClave) {
    formClave.addEventListener('submit', async (e) => {
      e.preventDefault();
      const actual = formClave.querySelector('[name="actual"]').value;
      const nueva = formClave.querySelector('[name="nueva"]').value;
      const repetir = formClave.querySelector('[name="repetir"]').value;
      if (!actual) return mostrarMensaje('Ingresá tu contraseña actual.', 'error');
      if (nueva.length < 12) return mostrarMensaje('La nueva contraseña debe tener al menos 12 caracteres.', 'error');
      if (nueva !== repetir) return mostrarMensaje('Las contraseñas nuevas no coinciden.', 'error');
      try {
        await api('clave', { method: 'POST', body: { actual, nueva } });
        formClave.reset();
        if (formClave.dataset.alTerminar === 'recargar') { location.href = './'; return; }
        mostrarMensaje('Contraseña actualizada.', 'ok');
      } catch (err) {
        mostrarMensaje(err.message, 'error');
      }
    });
  }
  return sesion;
}
