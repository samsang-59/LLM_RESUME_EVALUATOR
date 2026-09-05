// CLI: `npm run migrate` - applies any pending migrations to the configured database.
const { runMigrations } = require('../src/config/migrator');
const db = require('../src/config/db');
const config = require('../src/config/env');

(async () => {
  try {
    console.log(`[migrate] ${config.dbDialect} -> ${db.location}`);
    await runMigrations({ silent: false });
    await db.close();
  } catch (err) {
    console.error(`[migrate] FAILED\n${err.message}`);
    process.exitCode = 1;
    await db.close();
  }
})();
