'use strict';
// API de notas (calificaciones): catedráticos ingresan y publican; estudiantes consultan las propias.
const express = require('express');
const config = require('./config');
const { cursos, asignaciones, notas, transaccion } = require('./db');
const { registrar, requiereRol } = require('./auth');
const { validarId, validarNotas, COMPONENTES } = require('./validacion');

const ETIQUETAS = { p1: 'P1', p2: 'P2', act: 'Act', final: 'Final' };

// Total y estado calculados en el servidor, para que todos vean el mismo resultado.
function conResultado(fila) {
  const valores = COMPONENTES.map((c) => fila[c]);
  const completo = valores.every((v) => v !== null && v !== undefined);
  const total = Math.round(valores.reduce((s, v) => s + (v || 0), 0) * 100) / 100;
  let estado = 'En curso';
  if (completo) estado = total >= config.notaAprobacion ? 'Aprobado' : 'Reprobado';
  return { ...fila, total, estado };
}

// ---------- Catedrático ----------
const docente = express.Router();
docente.use(requiereRol('docente'));

function cursoPropio(req, res) {
  const id = validarId(req.params.id);
  const curso = id && cursos.porId(id);
  if (!curso || curso.docente_id !== req.usuario.id) {
    res.status(404).json({ error: 'Curso no encontrado.' });
    return null;
  }
  return curso;
}

docente.get('/cursos', (req, res) => {
  res.json(cursos.delDocente(req.usuario.id));
});

docente.get('/cursos/:id', (req, res) => {
  const curso = cursoPropio(req, res);
  if (!curso) return;
  res.json({ curso, estudiantes: asignaciones.estudiantesConNotas(curso.id).map(conResultado) });
});

docente.put('/cursos/:id/notas', (req, res) => {
  const curso = cursoPropio(req, res);
  if (!curso) return;
  const filas = Array.isArray(req.body && req.body.notas) ? req.body.notas : null;
  if (!filas || filas.length > 500) return res.status(400).json({ error: 'Datos de notas no válidos.' });

  const actuales = new Map(asignaciones.estudiantesConNotas(curso.id).map((e) => [e.id, e]));
  const invalidas = [];
  const cambios = [];
  for (const fila of filas) {
    const eid = validarId(fila && fila.id);
    const anterior = eid && actuales.get(eid);
    if (!anterior) return res.status(400).json({ error: 'Hay estudiantes que no pertenecen a este curso.' });
    const { datos, errores } = validarNotas(fila, curso);
    if (errores.length) { invalidas.push({ id: eid, campos: errores }); continue; }
    const diferencias = COMPONENTES.filter((c) => datos[c] !== anterior[c]);
    if (diferencias.length) cambios.push({ anterior, datos, diferencias });
  }
  if (invalidas.length) {
    return res.status(400).json({ error: 'Hay notas fuera de rango (máximo según el punteo del curso, hasta 2 decimales).', invalidas });
  }

  transaccion(() => {
    for (const { anterior, datos, diferencias } of cambios) {
      notas.guardar(curso.id, anterior.id, datos);
      const detalle = diferencias.map((c) => `${ETIQUETAS[c]}: ${anterior[c] ?? '–'} → ${datos[c] ?? '–'}`).join(', ');
      registrar(req, 'Notas modificadas', `${curso.codigo} sec. ${curso.seccion} | ${anterior.carne} | ${detalle}`);
    }
  });
  res.json({ ok: true, modificados: cambios.length });
});

docente.post('/cursos/:id/publicacion', (req, res) => {
  const curso = cursoPropio(req, res);
  if (!curso) return;
  const publicar = Boolean(req.body && req.body.publicar);
  cursos.publicar(curso.id, publicar);
  registrar(req, publicar ? 'Notas publicadas' : 'Publicación de notas retirada', `${curso.codigo} sec. ${curso.seccion} (${curso.ciclo})`);
  res.json({ ok: true, publicadas: publicar });
});

// ---------- Estudiante ----------
const estudiante = express.Router();
estudiante.use(requiereRol('estudiante'));

estudiante.get('/notas', (req, res) => {
  res.json(notas.delEstudiante(req.usuario.id).map((c) => (c.notas_publicadas ? conResultado(c) : c)));
});

module.exports = { docente, estudiante };
