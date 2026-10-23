'use strict';
const session = require('express-session');
const { db } = require('./db');

// Almacén de sesiones en SQLite, para que sobrevivan a reinicios del proceso.
class AlmacenSQLite extends session.Store {
  constructor(ttlMs) {
    super();
    this.ttlMs = ttlMs;
    this.sqlGet = db.prepare('SELECT datos FROM sesiones WHERE sid = ? AND expira > ?');
    this.sqlSet = db.prepare(
      'INSERT INTO sesiones (sid, expira, datos) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET expira = excluded.expira, datos = excluded.datos'
    );
    this.sqlTouch = db.prepare('UPDATE sesiones SET expira = ? WHERE sid = ?');
    this.sqlDel = db.prepare('DELETE FROM sesiones WHERE sid = ?');
    this.sqlLimpiar = db.prepare('DELETE FROM sesiones WHERE expira <= ?');
    setInterval(() => this.sqlLimpiar.run(Date.now()), 15 * 60 * 1000).unref();
  }

  expiracion(sess) {
    const fin = sess && sess.cookie && sess.cookie.expires;
    return fin ? new Date(fin).getTime() : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const fila = this.sqlGet.get(sid, Date.now());
      cb(null, fila ? JSON.parse(fila.datos) : null);
    } catch (err) { cb(err); }
  }

  set(sid, sess, cb) {
    try {
      this.sqlSet.run(sid, this.expiracion(sess), JSON.stringify(sess));
      cb && cb(null);
    } catch (err) { cb && cb(err); }
  }

  touch(sid, sess, cb) {
    try {
      this.sqlTouch.run(this.expiracion(sess), sid);
      cb && cb(null);
    } catch (err) { cb && cb(err); }
  }

  destroy(sid, cb) {
    try {
      this.sqlDel.run(sid);
      cb && cb(null);
    } catch (err) { cb && cb(err); }
  }
}

module.exports = AlmacenSQLite;
