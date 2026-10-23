'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(path.dirname(config.rutaBD), { recursive: true });
const db = new DatabaseSync(config.rutaBD);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Esquema completo. CREATE ... IF NOT EXISTS permite arrancar tanto con una base nueva como con una existente.
function crearEsquema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      hash TEXT NOT NULL,
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sesiones (
      sid TEXT PRIMARY KEY,
      expira INTEGER NOT NULL,
      datos TEXT NOT NULL
    );
  `);
  // Columnas agregadas después de la primera versión (bases antiguas solo tenían usuario y hash).
  const columnas = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
  const agregar = {
    nombre: "TEXT NOT NULL DEFAULT ''",
    rol: "TEXT NOT NULL DEFAULT 'admin'",
    activo: 'INTEGER NOT NULL DEFAULT 1',
    debe_cambiar: 'INTEGER NOT NULL DEFAULT 0',
  };
  for (const [col, def] of Object.entries(agregar)) {
    if (!columnas.includes(col)) db.exec(`ALTER TABLE usuarios ADD COLUMN ${col} ${def}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS cursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      seccion TEXT NOT NULL,
      ciclo TEXT NOT NULL,
      docente_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      max_p1 REAL NOT NULL DEFAULT 15,
      max_p2 REAL NOT NULL DEFAULT 15,
      max_act REAL NOT NULL DEFAULT 35,
      max_final REAL NOT NULL DEFAULT 35,
      notas_publicadas INTEGER NOT NULL DEFAULT 0,
      publicado_en TEXT,
      UNIQUE (codigo, seccion, ciclo)
    );
    CREATE TABLE IF NOT EXISTS asignaciones (
      curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
      estudiante_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      PRIMARY KEY (curso_id, estudiante_id)
    );
    CREATE TABLE IF NOT EXISTS notas (
      curso_id INTEGER NOT NULL,
      estudiante_id INTEGER NOT NULL,
      p1 REAL, p2 REAL, act REAL, final REAL,
      actualizado TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (curso_id, estudiante_id),
      FOREIGN KEY (curso_id, estudiante_id) REFERENCES asignaciones(curso_id, estudiante_id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS bitacora (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      usuario TEXT,
      ip TEXT,
      accion TEXT NOT NULL,
      detalle TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cursos_docente ON cursos (docente_id);
    CREATE INDEX IF NOT EXISTS idx_asig_estudiante ON asignaciones (estudiante_id);
    -- La primera versión tenía noticias de ejemplo; la plataforma ya no las usa.
    DROP TABLE IF EXISTS publicaciones;
  `);
}

function inicializar() {
  crearEsquema();
}

// Ejecuta fn dentro de una transacción.
function transaccion(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---- Usuarios ----
const ROLES = ['admin', 'docente', 'estudiante'];
const CAMPOS_USUARIO = 'id, usuario, nombre, rol, activo, debe_cambiar, creado';

const usuarios = {
  contar: () => db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n,
  buscarPorNombre: (usuario) => db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario),
  buscarPorId: (id) => db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id),
  listar(rol) {
    return rol
      ? db.prepare(`SELECT ${CAMPOS_USUARIO} FROM usuarios WHERE rol = ? ORDER BY nombre, usuario`).all(rol)
      : db.prepare(`SELECT ${CAMPOS_USUARIO} FROM usuarios ORDER BY rol, nombre, usuario`).all();
  },
  crear(u) {
    const r = db.prepare('INSERT INTO usuarios (usuario, nombre, rol, hash, debe_cambiar) VALUES (?, ?, ?, ?, ?)')
      .run(u.usuario, u.nombre, u.rol, u.hash, u.debeCambiar ? 1 : 0);
    return Number(r.lastInsertRowid);
  },
  actualizar: (id, nombre, activo) =>
    db.prepare('UPDATE usuarios SET nombre = ?, activo = ? WHERE id = ?').run(nombre, activo ? 1 : 0, id),
  cambiarHash: (id, hash, debeCambiar = false) =>
    db.prepare('UPDATE usuarios SET hash = ?, debe_cambiar = ? WHERE id = ?').run(hash, debeCambiar ? 1 : 0, id),
};

// ---- Cursos, asignaciones y notas ----
const CAMPOS_CURSO = `c.id, c.codigo, c.nombre, c.seccion, c.ciclo, c.docente_id, c.max_p1, c.max_p2, c.max_act, c.max_final,
  c.notas_publicadas, c.publicado_en, d.nombre AS docente`;

const cursos = {
  listar: () => db.prepare(
    `SELECT ${CAMPOS_CURSO}, (SELECT COUNT(*) FROM asignaciones a WHERE a.curso_id = c.id) AS estudiantes
     FROM cursos c LEFT JOIN usuarios d ON d.id = c.docente_id ORDER BY c.ciclo DESC, c.codigo, c.seccion`
  ).all(),
  delDocente: (docenteId) => db.prepare(
    `SELECT ${CAMPOS_CURSO}, (SELECT COUNT(*) FROM asignaciones a WHERE a.curso_id = c.id) AS estudiantes
     FROM cursos c LEFT JOIN usuarios d ON d.id = c.docente_id WHERE c.docente_id = ? ORDER BY c.ciclo DESC, c.codigo`
  ).all(docenteId),
  porId: (id) => db.prepare(`SELECT ${CAMPOS_CURSO} FROM cursos c LEFT JOIN usuarios d ON d.id = c.docente_id WHERE c.id = ?`).get(id),
  crear(c) {
    const r = db.prepare(
      `INSERT INTO cursos (codigo, nombre, seccion, ciclo, docente_id, max_p1, max_p2, max_act, max_final)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(c.codigo, c.nombre, c.seccion, c.ciclo, c.docente_id, c.max_p1, c.max_p2, c.max_act, c.max_final);
    return Number(r.lastInsertRowid);
  },
  actualizar: (id, c) => db.prepare(
    `UPDATE cursos SET codigo = ?, nombre = ?, seccion = ?, ciclo = ?, docente_id = ?,
     max_p1 = ?, max_p2 = ?, max_act = ?, max_final = ? WHERE id = ?`
  ).run(c.codigo, c.nombre, c.seccion, c.ciclo, c.docente_id, c.max_p1, c.max_p2, c.max_act, c.max_final, id),
  eliminar: (id) => db.prepare('DELETE FROM cursos WHERE id = ?').run(id).changes,
  publicar: (id, publicar) => db.prepare(
    `UPDATE cursos SET notas_publicadas = ?, publicado_en = CASE WHEN ? THEN datetime('now', 'localtime') ELSE publicado_en END WHERE id = ?`
  ).run(publicar ? 1 : 0, publicar ? 1 : 0, id),
  // Mayor nota registrada por componente, para no reducir un máximo por debajo de notas existentes.
  maximosRegistrados: (id) => db.prepare(
    'SELECT MAX(p1) AS p1, MAX(p2) AS p2, MAX(act) AS act, MAX(final) AS final FROM notas WHERE curso_id = ?'
  ).get(id),
};

const asignaciones = {
  estudiantesConNotas: (cursoId) => db.prepare(
    `SELECT u.id, u.usuario AS carne, u.nombre, u.activo, n.p1, n.p2, n.act, n.final, n.actualizado
     FROM asignaciones a JOIN usuarios u ON u.id = a.estudiante_id
     LEFT JOIN notas n ON n.curso_id = a.curso_id AND n.estudiante_id = a.estudiante_id
     WHERE a.curso_id = ? ORDER BY u.nombre, u.usuario`
  ).all(cursoId),
  agregar: (cursoId, estudianteId) =>
    db.prepare('INSERT OR IGNORE INTO asignaciones (curso_id, estudiante_id) VALUES (?, ?)').run(cursoId, estudianteId).changes,
  quitar: (cursoId, estudianteId) =>
    db.prepare('DELETE FROM asignaciones WHERE curso_id = ? AND estudiante_id = ?').run(cursoId, estudianteId).changes,
  existe: (cursoId, estudianteId) =>
    Boolean(db.prepare('SELECT 1 FROM asignaciones WHERE curso_id = ? AND estudiante_id = ?').get(cursoId, estudianteId)),
};

const notas = {
  guardar: (cursoId, estudianteId, n) => db.prepare(
    `INSERT INTO notas (curso_id, estudiante_id, p1, p2, act, final) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (curso_id, estudiante_id) DO UPDATE SET p1 = excluded.p1, p2 = excluded.p2, act = excluded.act,
     final = excluded.final, actualizado = datetime('now', 'localtime')`
  ).run(cursoId, estudianteId, n.p1, n.p2, n.act, n.final),
  // Solo cursos con notas publicadas muestran calificaciones al estudiante.
  delEstudiante: (estudianteId) => db.prepare(
    `SELECT c.id, c.codigo, c.nombre, c.seccion, c.ciclo, c.notas_publicadas, c.publicado_en, d.nombre AS docente,
       c.max_p1, c.max_p2, c.max_act, c.max_final,
       CASE WHEN c.notas_publicadas = 1 THEN n.p1 END AS p1,
       CASE WHEN c.notas_publicadas = 1 THEN n.p2 END AS p2,
       CASE WHEN c.notas_publicadas = 1 THEN n.act END AS act,
       CASE WHEN c.notas_publicadas = 1 THEN n.final END AS final
     FROM asignaciones a JOIN cursos c ON c.id = a.curso_id
     LEFT JOIN usuarios d ON d.id = c.docente_id
     LEFT JOIN notas n ON n.curso_id = a.curso_id AND n.estudiante_id = a.estudiante_id
     WHERE a.estudiante_id = ? ORDER BY c.ciclo DESC, c.codigo`
  ).all(estudianteId),
};

// ---- Bitácora ----
const bitacora = {
  registrar: (usuario, ip, accion, detalle) =>
    db.prepare('INSERT INTO bitacora (usuario, ip, accion, detalle) VALUES (?, ?, ?, ?)').run(usuario || null, ip || null, accion, detalle || null),
  recientes: (limite) => db.prepare('SELECT * FROM bitacora ORDER BY id DESC LIMIT ?').all(limite),
};

module.exports = {
  db, inicializar, transaccion,
  usuarios, cursos, asignaciones, notas, bitacora,
  ROLES,
};
