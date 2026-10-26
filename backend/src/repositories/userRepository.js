// The ONLY layer that writes SQL for users (doc 07 / doc 09). Registering creates
// one, and looking up by email serves BOTH login and the "is this email free?" check.
//
// getUserById arrived with Phase 7's refresh door, which knows only the user id a
// refresh token belongs to. The JWT guard still never calls it: an access token is
// stateless (doc 09) and is verified by signature alone, with no database hit.
const db = require('../config/db');
const { ConflictError } = require('../utils/errors');

/**
 * A users row -> the object the rest of the app uses.
 *
 * password_hash is NOT included, and that is the point: this mapper is what every
 * layer above sees, so the hash cannot be leaked into a response by accident. The
 * one caller that legitimately needs it (login, to compare against) asks for it
 * explicitly through getUserByEmail's `withPasswordHash` option.
 */
function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    createdAt: row.created_at,
  };
}

/**
 * INSERT a new HR account. The caller hashes the password - a repository stores
 * what it is given and knows nothing about bcrypt.
 *
 * The service checks the email is free first, but that check and this INSERT are
 * two separate moments, and two simultaneous registrations can both pass the check.
 * The UNIQUE constraint is the real guarantee, so its violation is translated here
 * into the same ConflictError the service raises - here, because the shape of that
 * error message is SQLite's, and the repository is the only layer allowed to know
 * which database we are on.
 */
async function createUser({ username, email, passwordHash }) {
  try {
    const { rows } = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [username, email, passwordHash]
    );
    return toUser(rows[0]);
  } catch (err) {
    if (/UNIQUE constraint failed: users\.email/i.test(err.message)) {
      throw new ConflictError('That email is already registered');
    }
    throw err;
  }
}

/**
 * SELECT one user by their login identifier.
 *
 * @param {string} email
 * @param {{withPasswordHash?: boolean}} [options] login needs the hash to compare
 *   against; nothing else does, so nothing else gets it.
 * @returns {Promise<object|null>} null when nobody has that email
 */
async function getUserByEmail(email, { withPasswordHash = false } = {}) {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!rows[0]) return null;

  const user = toUser(rows[0]);
  if (withPasswordHash) user.passwordHash = rows[0].password_hash;
  return user;
}

/**
 * SELECT one user by id - the refresh door's lookup (Phase 7). Never the hash.
 * @returns {Promise<object|null>} null when the account no longer exists
 */
async function getUserById(id) {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return toUser(rows[0]);
}

module.exports = { createUser, getUserByEmail, getUserById, toUser };
