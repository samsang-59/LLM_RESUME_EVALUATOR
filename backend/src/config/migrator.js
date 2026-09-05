// Runs the SQL migration files in order and records which ones have been applied.
//
// Kept deliberately small and dialect-aware: the .sql files live under
// migrations/<dialect>/, so moving to Postgres means adding migrations/postgres/
// and swapping config/db.js - no other layer changes (doc 07).
const fs = require('fs');
const path = require('path');
const db = require('./db');
const config = require('./env');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations', config.dbDialect);

// The ledger of what has already run. Created before anything else.
const LEDGER_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

/** The migration files on disk, in the order their numeric prefix demands. */
function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`No migrations directory for dialect "${config.dbDialect}": ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Names already recorded in the ledger. */
async function appliedMigrations() {
  await db.exec(LEDGER_SQL);
  const { rows } = await db.query('SELECT name FROM schema_migrations ORDER BY name');
  return rows.map((r) => r.name);
}

/**
 * Apply every migration that has not run yet.
 * Safe to call repeatedly - already-applied files are skipped (idempotent).
 * Each file runs inside a transaction, so a broken migration leaves no half-built table.
 *
 * @returns {Promise<{applied: string[], skipped: string[], total: number}>}
 */
async function runMigrations({ silent = config.isTest } = {}) {
  const files = migrationFiles();
  const already = await appliedMigrations();

  const applied = [];
  const skipped = [];

  for (const file of files) {
    if (already.includes(file)) {
      skipped.push(file);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

    await db.exec('BEGIN');
    try {
      await db.exec(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw new Error(`Migration failed: ${file}\n  ${err.message}`);
    }

    applied.push(file);
    if (!silent) {
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied ${file}`);
    }
  }

  if (!silent) {
    // eslint-disable-next-line no-console
    console.log(
      applied.length
        ? `[migrate] done - ${applied.length} applied, ${skipped.length} already up to date`
        : '[migrate] nothing to do - database already up to date'
    );
  }

  return { applied, skipped, total: files.length };
}

module.exports = { runMigrations, migrationFiles, appliedMigrations, MIGRATIONS_DIR };
