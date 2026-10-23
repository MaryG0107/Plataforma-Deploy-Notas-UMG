'use strict';
// Crea datos de DEMOSTRACIÓN FICTICIOS: un catedrático, cinco estudiantes y un curso con notas sin publicar.
// Las contraseñas se generan al azar y se muestran una sola vez en la consola.
// Uso: npm run demo   (con el servidor detenido o en marcha; no borra nada existente)
const db = require('../src/db');
db.inicializar();
const auth = require('../src/auth');

const DOCENTE = { usuario: 'docente.demo', nombre: 'Catedrático Ficticio' };
const ESTUDIANTES = [
  ['DEMO-0001', 'Estudiante Ficticio Uno', [12, 13, 30, 28]],
  ['DEMO-0002', 'Estudiante Ficticio Dos', [9, 10, 25, 15]],
  ['DEMO-0003', 'Estudiante Ficticio Tres', [15, 14, 33, 31]],
  ['DEMO-0004', 'Estudiante Ficticio Cuatro', [7, 11, 20, null]],
  ['DEMO-0005', 'Estudiante Ficticio Cinco', [13.5, 12, 29, 24]],
];

async function crearSiNoExiste(usuario, nombre, rol, credenciales) {
  const existente = db.usuarios.buscarPorNombre(usuario);
  if (existente) return existente.id;
  const clave = auth.claveTemporal();
  const id = db.usuarios.crear({ usuario, nombre, rol, hash: await auth.hashear(clave) });
  credenciales.push({ usuario, rol, clave });
  return id;
}

async function main() {
  const credenciales = [];
  const docenteId = await crearSiNoExiste(DOCENTE.usuario, DOCENTE.nombre, 'docente', credenciales);
  const ids = [];
  for (const [carne, nombre] of ESTUDIANTES) ids.push(await crearSiNoExiste(carne, nombre, 'estudiante', credenciales));

  const ciclo = `${new Date().getFullYear()} - Ciclo de ejemplo`;
  let curso = db.cursos.listar().find((c) => c.codigo === 'DEMO-101' && c.seccion === 'A' && c.ciclo === ciclo);
  const cursoId = curso ? curso.id : db.cursos.crear({
    codigo: 'DEMO-101', nombre: 'Programación I (curso de ejemplo)', seccion: 'A', ciclo,
    docente_id: docenteId, max_p1: 15, max_p2: 15, max_act: 35, max_final: 35,
  });
  db.transaccion(() => {
    ESTUDIANTES.forEach(([, , [p1, p2, act, final]], i) => {
      if (db.asignaciones.agregar(cursoId, ids[i])) db.notas.guardar(cursoId, ids[i], { p1, p2, act, final });
    });
  });
  db.bitacora.registrar('scripts/demo', null, 'Datos de demostración', 'Cuentas y curso DEMO-101 ficticios');

  console.log('\nDatos de demostración (FICTICIOS) listos. Curso: DEMO-101 sección A, notas sin publicar.\n');
  if (credenciales.length) {
    console.log('Credenciales nuevas (se muestran solo esta vez):');
    console.table(credenciales);
  } else {
    console.log('Las cuentas demo ya existían; sus contraseñas no se modificaron (restablecelas desde el panel).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
