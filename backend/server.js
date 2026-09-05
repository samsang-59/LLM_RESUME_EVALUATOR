// Entry point. Kept separate from app.js so importing the app never starts a server.
const createApp = require('./src/app');
const config = require('./src/config/env');

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${config.port} (${config.nodeEnv})`);
});
