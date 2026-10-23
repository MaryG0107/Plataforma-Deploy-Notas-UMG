'use strict';
// Pestaña "Usuarios": cuentas de administradores, catedráticos y estudiantes.

const NOMBRE_ROL = { admin: 'Administrador', docente: 'Catedrático', estudiante: 'Estudiante' };
let usuLista = [];

function usuFila(u) {
  const estado = !u.activo
    ? crear('span', { class: 'estado-pill estado-pill--reprobado' }, 'Inactivo')
    : u.debe_cambiar
      ? crear('span', { class: 'estado-pill estado-pill--borrador' }, 'Clave temporal')
      : crear('span', { class: 'estado-pill estado-pill--publicado' }, 'Activo');
  const propio = u.usuario === sesion.usuario;
  return crear('tr', null,
    crear('td', { 'data-col': 'Usuario' }, u.usuario),
    crear('td', { 'data-col': 'Nombre' }, u.nombre || '—'),
    crear('td', { 'data-col': 'Rol' }, NOMBRE_ROL[u.rol] || u.rol),
    crear('td', { 'data-col': 'Estado' }, estado),
    crear('td', { class: 'acciones' },
      boton('Renombrar', 'boton--claro boton--borde boton--chico', () => usuRenombrar(u)),
      propio ? null : boton('Nueva clave', 'boton--claro boton--borde boton--chico', () => usuRestablecer(u)),
      propio ? null : boton(u.activo ? 'Desactivar' : 'Activar', u.activo ? 'boton--peligro boton--chico' : 'boton--claro boton--borde boton--chico',
        () => usuActualizar(u, u.nombre, !u.activo))));
}

function usuPintar() {
  const rol = document.getElementById('usu-filtro').value;
  const q = document.getElementById('usu-buscar').value.trim().toLowerCase();
  const visibles = usuLista.filter((u) => (!rol || u.rol === rol)
    && (!q || u.usuario.toLowerCase().includes(q) || (u.nombre || '').toLowerCase().includes(q)));
  document.getElementById('usu-tabla').replaceChildren(...(visibles.length
    ? visibles.map(usuFila)
    : [crear('tr', null, crear('td', { colspan: '5', class: 'vacio' }, 'No hay usuarios con ese filtro.'))]));
}

async function usuCargar() {
  usuLista = await api('gestion/usuarios');
  usuPintar();
}

async function usuActualizar(u, nombre, activo) {
  if (!activo && !confirm(`¿Desactivar la cuenta "${u.usuario}"? No podrá ingresar hasta que se active de nuevo.`)) return;
  try {
    await api(`gestion/usuarios/${u.id}`, { method: 'PUT', body: { nombre, activo } });
    mostrarMensaje('Usuario actualizado.', 'ok');
    await usuCargar();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

function usuRenombrar(u) {
  const nombre = prompt(`Nombre completo de ${u.usuario}:`, u.nombre || '');
  if (nombre === null) return;
  usuActualizar(u, nombre.trim(), Boolean(u.activo));
}

async function usuRestablecer(u) {
  if (!confirm(`¿Generar una contraseña temporal nueva para "${u.usuario}"? La actual dejará de funcionar.`)) return;
  try {
    const r = await api(`gestion/usuarios/${u.id}/restablecer`, { method: 'POST' });
    mostrarClaves([{ usuario: r.usuario, nombre: u.nombre, clave: r.clave }]);
    await usuCargar();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  }
}

async function usuCrear(e) {
  e.preventDefault();
  const form = e.target;
  limpiarErrores(form);
  const datos = { rol: form.rol.value, usuario: form.usuario.value.trim(), nombre: form.nombre.value.trim() };
  const errores = {};
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(datos.usuario)) errores.usuario = 'De 3 a 50 caracteres: letras, números, punto, guion o guion bajo.';
  if (datos.nombre.length < 3 || datos.nombre.length > 100) errores.nombre = 'El nombre debe tener entre 3 y 100 caracteres.';
  if (Object.keys(errores).length) return marcarErrores(form, errores);
  try {
    const r = await api('gestion/usuarios', { method: 'POST', body: datos });
    form.usuario.value = '';
    form.nombre.value = '';
    mostrarMensaje(`Cuenta "${r.usuario}" creada.`, 'ok');
    mostrarClaves([r]);
    await usuCargar();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
    marcarErrores(form, err.errores);
  }
}

async function usuLote(e) {
  e.preventDefault();
  const texto = document.getElementById('usu-lote-texto').value.trim();
  const caja = document.getElementById('usu-lote-rechazados');
  caja.replaceChildren();
  if (!texto) return mostrarMensaje('Pegá al menos una línea con "carné, nombre".', 'error');
  const enviar = e.target.querySelector('button[type="submit"]');
  enviar.disabled = true;
  mostrarMensaje('Creando cuentas…');
  try {
    const r = await api('gestion/usuarios/lote', { method: 'POST', body: { texto } });
    mostrarMensaje(`${r.creados.length} cuenta(s) creada(s). ${r.rechazados.length} línea(s) rechazada(s).`, r.creados.length ? 'ok' : 'error');
    if (r.rechazados.length) {
      caja.append(crear('p', { class: 'campo__error' }, 'Líneas rechazadas:'),
        crear('ul', { class: 'lista-errores' }, ...r.rechazados.map((x) => crear('li', null, `Línea ${x.linea} (${x.texto}): ${x.motivo}`))));
    }
    if (r.creados.length) {
      document.getElementById('usu-lote-texto').value = '';
      mostrarClaves(r.creados);
    }
    await usuCargar();
  } catch (err) {
    mostrarMensaje(err.message, 'error');
  } finally {
    enviar.disabled = false;
  }
}

async function iniciarUsuarios() {
  document.getElementById('usu-filtro').addEventListener('change', usuPintar);
  document.getElementById('usu-buscar').addEventListener('input', usuPintar);
  document.getElementById('usu-form').addEventListener('submit', usuCrear);
  document.getElementById('usu-lote').addEventListener('submit', usuLote);
  await usuCargar();
}
