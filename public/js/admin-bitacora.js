'use strict';
// Pestaña "Bitácora": registro de auditoría (solo lectura).

let bitLista = [];

function bitPintar() {
  const q = document.getElementById('bit-buscar').value.trim().toLowerCase();
  const visibles = bitLista.filter((b) => !q
    || [b.usuario, b.accion, b.detalle, b.ip].some((v) => (v || '').toLowerCase().includes(q)));
  document.getElementById('bit-tabla').replaceChildren(...(visibles.length
    ? visibles.map((b) => crear('tr', null,
      crear('td', { 'data-col': 'Fecha' }, b.fecha),
      crear('td', { 'data-col': 'Usuario' }, b.usuario || '—'),
      crear('td', { 'data-col': 'IP' }, b.ip || '—'),
      crear('td', { 'data-col': 'Acción' }, b.accion),
      crear('td', { 'data-col': 'Detalle' }, b.detalle || '')))
    : [crear('tr', null, crear('td', { colspan: '5', class: 'vacio' }, 'Sin eventos.'))]));
}

async function bitCargar() {
  bitLista = await api('gestion/bitacora');
  bitPintar();
}

async function iniciarBitacora() {
  document.getElementById('bit-buscar').addEventListener('input', bitPintar);
  document.getElementById('bit-actualizar').addEventListener('click', () => bitCargar().catch((err) => mostrarMensaje(err.message, 'error')));
  await bitCargar();
}
