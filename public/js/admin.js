'use strict';
// Pestañas del panel de administración. Cada sección se carga la primera vez que se abre.

const SECCIONES = {
  cursos: () => iniciarCursos(),
  usuarios: () => iniciarUsuarios(),
  bitacora: () => iniciarBitacora(),
};
const iniciadas = new Set();

function abrirPestana(nombre) {
  if (!SECCIONES[nombre]) nombre = 'cursos';
  document.querySelectorAll('[role="tab"]').forEach((t) => {
    const activa = t.dataset.tab === nombre;
    t.setAttribute('aria-selected', String(activa));
    t.tabIndex = activa ? 0 : -1;
  });
  document.querySelectorAll('[role="tabpanel"]').forEach((p) => { p.hidden = p.id !== `sec-${nombre}`; });
  mostrarMensaje('');
  if (!iniciadas.has(nombre)) {
    iniciadas.add(nombre);
    SECCIONES[nombre]().catch((err) => mostrarMensaje(err.message, 'error'));
  }
  try { history.replaceState(null, '', `#${nombre}`); } catch { /* sin historial */ }
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await iniciarPortal();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
    return;
  }
  const pestanas = [...document.querySelectorAll('[role="tab"]')];
  pestanas.forEach((t, i) => {
    t.addEventListener('click', () => abrirPestana(t.dataset.tab));
    t.addEventListener('keydown', (e) => {
      const paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!paso) return;
      const sig = pestanas[(i + paso + pestanas.length) % pestanas.length];
      sig.focus();
      abrirPestana(sig.dataset.tab);
    });
  });
  abrirPestana(location.hash.slice(1));
});
