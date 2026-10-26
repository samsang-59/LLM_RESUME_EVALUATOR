// The ONLY layer that writes SQL for refresh tokens (Phase 7). It stores and finds
// HASHES - the token itself never reaches this file (utils/secrets).
const db = require('../config/db');

/** A refresh_tokens row -> the object the auth service uses. */
function toRefreshToken(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/** INSERT a new refresh token for a user. */
async function createRefreshToken({ userId, tokenHash, expiresAt }) {
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, tokenHash, expiresAt]
  );
  return toRefreshToken(rows[0]);
}

/** SELECT one token by its hash - revoked and expired ones included, the service judges them. */
async function getRefreshTokenByHash(tokenHash) {
  const { rows } = await db.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [
    tokenHash,
  ]);
  return toRefreshToken(rows[0]);
}

/**
 * Mark one token revoked, but only if it is not revoked already.
 *
 * The `revoked_at IS NULL` condition is what makes rotation safe under a race: two
 * requests presenting the same token can both read it as valid, but only ONE of them
 * can flip it here. The other sees `false` and is refused.
 *
 * @returns {Promise<boolean>} true if this call did the revoking
 */
async function revokeRefreshToken(id) {
  const { rowCount } = await db.query(
    `UPDATE refresh_tokens
        SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
  return rowCount === 1;
}

/** Revoke every live token a user holds - the answer to a stolen token being replayed. */
async function revokeAllForUser(userId) {
  const { rowCount } = await db.query(
    `UPDATE refresh_tokens
        SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  return rowCount;
}

module.exports = {
  createRefreshToken,
  getRefreshTokenByHash,
  revokeRefreshToken,
  revokeAllForUser,
  toRefreshToken,
};
