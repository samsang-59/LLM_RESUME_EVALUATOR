// The single database connection. Repositories use this; nothing else opens one.
//
// Phase 0 runs on node:sqlite (no server to install). The design (doc 07) keeps the
// repository as the ONLY layer touching the DB, so the eventual move to Postgres is
// contained here. Three deliberate choices make that swap nearly free:
//
//   1. The API is ASYNC (`await db.query(...)` -> `{ rows, rowCount }`), even though
//      node:sqlite is synchronous, so repository code never changes shape.
//   2. Repositories write POSTGRES-STYLE placeholders ($1, $2). We translate them to
//      SQLite's `?` here, so the SQL in the repos is already Postgres-ready.
//   3. Rows come back as plain objects (node:sqlite returns null-prototype ones).
//
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const config = require('./env');

// ':memory:' stays literal; a path is resolved against the backend root so the
// database location never depends on the process working directory.
function resolveLocation(file) {
  if (file === ':memory:') return file;
  const abs = path.resolve(__dirname, '../../', file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

const location = resolveLocation(config.databaseFile);

const db = new DatabaseSync(location);
// SQLite does not enforce foreign keys unless asked, per connection.
db.exec('PRAGMA foreign_keys = ON');

// $1, $2 ... -> ?, ?  (repos speak Postgres; SQLite is the current backend)
function toSqlitePlaceholders(text) {
  return text.replace(/\$(\d+)/g, '?');
}

// node:sqlite hands back null-prototype objects; normalise so tests and JSON behave.
function plain(row) {
  return row === undefined ? undefined : { ...row };
}

// Statements that return rows must use .all(); the rest use .run().
const RETURNS_ROWS = /^\s*(select|with|pragma)\b|\breturning\b/i;

/**
 * Run one SQL statement.
 * @param {string} text SQL using $1-style placeholders
 * @param {Array} params bound values
 * @returns {Promise<{rows: object[], rowCount: number}>}
 */
async function query(text, params = []) {
  const statement = db.prepare(toSqlitePlaceholders(text));
  if (RETURNS_ROWS.test(text)) {
    const rows = statement.all(...params).map(plain);
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...params);
  return { rows: [], rowCount: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
}

/** Run raw SQL that may contain several statements (migrations use this). */
async function exec(sql) {
  db.exec(sql);
}

/** Health check - used by /health and the Phase 0 test round. */
async function ping() {
  const { rows } = await query('SELECT 1 AS ok');
  return rows.length > 0 && rows[0].ok === 1;
}

async function close() {
  db.close();
}

module.exports = { query, exec, ping, close, raw: db, location };
