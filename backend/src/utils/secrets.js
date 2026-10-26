// Random secrets we hand out, and the one-way hash we keep of them (Phase 7).
//
// Two kinds of secret are issued by this server: refresh tokens (to HR) and ATS API
// keys (to each external system). Both follow the same rule - the caller gets the
// secret once, the database gets only its SHA-256 hash - so a stolen table opens
// nothing.
//
// Why SHA-256 and not bcrypt, when passwords use bcrypt: a password is chosen by a
// person and can be guessed from a dictionary, so its hash must be slow to attack.
// These are 32 bytes from the operating system's random generator - there is no
// dictionary, and 2^256 guesses stay out of reach however fast each one is. A fast
// hash also lets us find the row by its hash with an ordinary indexed lookup.
const crypto = require('crypto');

/** 32 random bytes, URL-safe text. `prefix` makes a key recognisable in a log or a config file. */
function generateSecret(prefix = '') {
  return prefix + crypto.randomBytes(32).toString('base64url');
}

/** The hex SHA-256 of a secret - what the database stores and searches by. */
function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest('hex');
}

module.exports = { generateSecret, hashSecret };
