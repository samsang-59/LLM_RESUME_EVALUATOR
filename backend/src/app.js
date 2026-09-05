// Builds the Express app. A factory, not a running server, so tests can mount the
// app with supertest without binding a port (server.js does the listening).
const express = require('express');
const db = require('./config/db');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');

function createApp() {
  const app = express();

  app.use(express.json());

  // Health check - reports the server and the database separately.
  app.get('/health', async (req, res) => {
    const dbUp = await db.ping().catch(() => false);
    res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      uptime: process.uptime(),
    });
  });

  // Phase 2 onwards mounts the API here:
  // app.use('/api', require('./routes'));

  // Order matters: unmatched routes first, then the central error handler last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
