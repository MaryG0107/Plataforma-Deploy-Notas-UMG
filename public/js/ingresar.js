'use strict';
// Ingreso por tipo de usuario (?tipo=estudiante | docente | admin). El servidor verifica que el rol coincida.

const TIPOS = {
  estudiante: {
    etiqueta: 'Estudiantes', titulo: 'Ver mis notas', sub: 'Ingresá con tu carné y contraseña.',
    lema: 'Tus notas, en cuanto se publican.', usuario: 'Carné', boton: 'Ver mis notas',
    otro: ['ingresar?tipo=docente', '¿Sos catedrático? Ingresá aquí'],
  },
  docente: {
    etiqueta: 'Catedráticos', titulo: 'Ingresar notas', sub: 'Ingresá con tu usuario de catedrático.',
    lema: 'Ingresá, revisá y publicá las notas de tus cursos.', usuario: 'Usuario', boton: 'Ingresar',
    otro: ['ingresar?tipo=estudiante', '¿Sos estudiante? Ingresá aquí'],
  },
  admin: {
    etiqueta: 'Administración', titulo: 'Acceso administrativo', sub: 'Solo personal autorizado.',
    lema: 'Cursos, cuentas y bitácora en un solo lugar.', usuario: 'Usuario', boton: 'Ingresar',
    otro: null,
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  const tipo = new URLSearchParams(location.search).get('tipo');
  const t = TIPOS[tipo] || TIPOS.estudiante;
  const form = document.getElementById('form-login');
  const boton = document.getElementById('btn-ingresar');

  document.body.classList.add(`tipo--${tipo in TIPOS ? tipo : 'estudiante'}`);
  document.getElementById('login-etiqueta').textContent = t.etiqueta;
  document.getElementById('login-titulo').textContent = t.titulo;
  document.getElementById('login-sub').textContent = t.sub;
  document.getElementById('login-lema').textContent = t.lema;
  document.getElementById('usuario-etiqueta').textContent = t.usuario;
  document.title = `${t.titulo} — Plataforma de notas`;
  boton.textContent = t.boton;
  const otro = document.getElementById('login-otro');
  if (t.otro) { otro.href = t.otro[0]; otro.textContent = t.otro[1]; } else { otro.parentElement.remove(); }

  try {
    csrfToken = (await api('csrf')).csrf;
  } catch {
    mostrarMensaje('No se pudo contactar al servidor.', 'error');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = form.usuario.value.trim();
    const clave = form.clave.value;
    document.getElementById('error-usuario').textContent = usuario.length >= 3 ? '' : `Ingresá tu ${t.usuario.toLowerCase()}.`;
    document.getElementById('error-clave').textContent = clave ? '' : 'Ingresá tu contraseña.';
    if (usuario.length < 3 || !clave) return;

    boton.disabled = true;
    mostrarMensaje('');
    try {
      await api('login', { method: 'POST', body: { usuario, clave, tipo } });
      location.href = './';
    } catch (err) {
      mostrarMensaje(err.message, 'error');
      form.clave.value = '';
      // El token puede haber cambiado (p. ej. sesión expirada); se renueva.
      try { csrfToken = (await api('csrf')).csrf; } catch { /* ignorar */ }
    } finally {
      boton.disabled = false;
    }
  });
});
