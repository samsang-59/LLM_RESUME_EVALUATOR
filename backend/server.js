// Entry point. Kept separate from app.js so importing the app never starts a server.
const createApp = require('./src/app');
const config = require('./src/config/env');
const db = require('./src/config/db');
const evaluationService = require('./src/services/evaluationService');

const app = createApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

// Shutting down cleanly matters more here than in most services: a resume submission
// is answered 202 and finished in the background, so killing the process the instant
// a signal arrives would abandon evaluations that a caller is already waiting on a
// webhook for. Stop taking new work, let the in-flight runs finish, then close.
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`[server] ${signal} received - finishing in-flight evaluations`);

  server.close();
  await evaluationService.awaitPendingRuns();
  await db.close();

  // eslint-disable-next-line no-console
  console.log('[server] shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
