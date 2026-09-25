// The JWT, issued at login and verified on every HR request (doc 09).
//
// Stateless by design: we store nothing. A token is a signed claim, and the guard
// only checks the signature and the expiry - no session table, no database hit per
// request. The cost of that is that a JWT cannot be withdrawn once issued, which is
// exactly why the expiry is short (one day, doc 09): it bounds the damage a leaked
// token can do without making HR log in every hour. Revocable refresh tokens are
// the proper fix and are parked for Phase 7.
const jwt = require('jsonwebtoken');
const config = require('./../config/env');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Sign a token for one user.
 *
 * The payload carries an id and an email and nothing else. A JWT is signed, not
 * encrypted - anyone holding it can read its contents - so it gets the minimum
 * needed to know who is calling, and never a password hash or a role we have not
 * designed yet.
 *
 * @param {{id: number, email: string}} user
 * @returns {string} the signed token
 */
function generateToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Verify a token and return who it says is calling.
 *
 * Every way a token can be wrong ends in the same 401: expired, tampered with,
 * signed by somebody else, or simply not a JWT at all. The distinction matters to
 * us while debugging, not to the caller - "your token is invalid" is the whole of
 * what they need, and saying more only helps someone probing the signature.
 *
 * @param {string} token
 * @returns {{id: number, email: string}}
 * @throws {UnauthorizedError}
 */
function verifyToken(token) {
  let claims;
  try {
    claims = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token expired');
    }
    throw new UnauthorizedError('Invalid token');
  }

  // A token we signed always has a numeric subject. Anything else is not ours,
  // however well-formed it looks.
  const id = Number(claims.sub);
  if (!Number.isInteger(id) || id <= 0) throw new UnauthorizedError('Invalid token');

  return { id, email: claims.email };
}

module.exports = { generateToken, verifyToken };
