'use strict';
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const config = require('./src/config');
const db = require('./src/db');
db.inicializar();

const AlmacenSQLite = require('./src/session-store');
const auth = require('./src/auth');
const rutasPlataforma = require('./src/rutas-plataforma');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      // Solo forzar HTTPS cuando el sitio realmente se sirve por HTTPS (permite acceso por IP con HTTP).
      upgradeInsecureRequests: config.cookieSegura ? [] : null,
    },
  },
  strictTransportSecurity: config.cookieSegura,
}));

const ttlMs = config.minutosSesion * 60 * 1000;
app.use(session({
  name: 'sid',
  secret: config.secretoSesion,
  store: new AlmacenSQLite(ttlMs),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSegura,
    maxAge: ttlMs,
  },
}));

// Recursos estáticos (CSS, JS, imágenes)
app.use('/assets', express.static(path.join(config.RAIZ, 'public'), { index: false }));

// Plataforma: páginas y API nunca se guardan en caché (contienen datos personales).
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/', rutasPlataforma);
// Direcciones de versiones anteriores.
app.get(['/portal', '/admin'], (req, res) => res.redirect(req.originalUrl.endsWith('/') ? '../' : './'));

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Recurso no encontrado.' });
  }
  res.status(404).type('text').send('Página no encontrada.');
});

app.use((err, req, res, next) => {
  const estado = err.status || err.statusCode || 500;
  if (estado >= 500) console.error(err);
  if (res.headersSent) return next(err);
  const mensaje = estado >= 500 ? 'Error interno del servidor.' : 'Solicitud no válida.';
  if (req.path.includes('/api')) return res.status(estado).json({ error: mensaje });
  res.status(estado).type('text').send(mensaje);
});

auth.crearAdminInicial()
  .catch((err) => console.error('No se pudo crear la cuenta inicial:', err))
  .finally(() => {
    app.listen(config.puerto, config.host, () => {
      console.log(`Servidor escuchando en http://${config.host}:${config.puerto}`);
    });
  });
