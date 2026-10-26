// The ONLY layer that writes SQL for ATS clients (Phase 7). Like refresh tokens,
// it stores and searches by the key's HASH; the key itself never reaches this file.
const db = require('../config/db');

/**
 * An ats_clients row -> the object the rest of the app uses.
 *
 * key_hash is NOT included: this is what the HR list door returns, and a hash has
 * no business in a response.
 */
function toAtsClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    active: row.revoked_at === null,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/** INSERT a new client with the hash of its freshly generated key. */
async function createAtsClient({ name, keyHash }) {
  const { rows } = await db.query(
    'INSERT INTO ats_clients (name, key_hash) VALUES ($1, $2) RETURNING *',
    [name, keyHash]
  );
  return toAtsClient(rows[0]);
}

/** SELECT every client, newest first - active and revoked alike. */
async function listAtsClients() {
  const { rows } = await db.query('SELECT * FROM ats_clients ORDER BY created_at DESC, id DESC');
  return rows.map(toAtsClient);
}

/** SELECT one client by id, or null. */
async function getAtsClientById(id) {
  const { rows } = await db.query('SELECT * FROM ats_clients WHERE id = $1', [id]);
  return toAtsClient(rows[0]);
}

/**
 * The submit door's lookup: the client holding this key, ONLY if not revoked.
 * A revoked key and a key that never existed both come back null - the guard
 * answers them the same way.
 */
async function getActiveAtsClientByKeyHash(keyHash) {
  const { rows } = await db.query(
    'SELECT * FROM ats_clients WHERE key_hash = $1 AND revoked_at IS NULL',
    [keyHash]
  );
  return toAtsClient(rows[0]);
}

/** Revoke one client. Revoking twice is harmless - the first timestamp is kept. */
async function revokeAtsClient(id) {
  await db.query(
    `UPDATE ats_clients
        SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
  return getAtsClientById(id);
}

module.exports = {
  createAtsClient,
  listAtsClients,
  getAtsClientById,
  getActiveAtsClientByKeyHash,
  revokeAtsClient,
  toAtsClient,
};
