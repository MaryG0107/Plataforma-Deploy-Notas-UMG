'use strict';

document.addEventListener('DOMContentLoaded', () => {
  iniciarPortal().catch((err) => mostrarMensaje(err.message, 'error'));
});
