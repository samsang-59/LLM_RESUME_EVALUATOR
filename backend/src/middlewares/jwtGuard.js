// The guard on the HR doors (doc 09).
//
// The other half of a pair: apiKeyGuard proves a MACHINE (the ATS) may push work
// in, this proves a PERSON (HR) may look at it. Same 401, different evidence.
//
// It touches no database. A JWT carries its own claim and its own signature, so
// verifying it is arithmetic - which is what makes it cheap enough to stand in
// front of every read door.
const tokenService = require('../services/tokenService');
const { UnauthorizedError } = require('../utils/errors');

const HEADER = 'authorization';
const SCHEME = /^Bearer (.+)$/i;

function jwtGuard(req, res, next) {
  const header = req.get(HEADER);
  if (!header) {
    return next(new UnauthorizedError('Missing Authorization header'));
  }

  // "Bearer <token>", and only that. A bare token, or Basic auth, is not a near
  // miss to be helpfully accepted - it is a caller using a different scheme.
  const match = SCHEME.exec(header.trim());
  if (!match) {
    return next(new UnauthorizedError('Authorization header must be "Bearer <token>"'));
  }

  // Throws UnauthorizedError for expired, tampered, foreign-signed and malformed
  // tokens alike - the caller learns that it did not work, not which of those it was.
  req.user = tokenService.verifyToken(match[1].trim());
  return next();
}

module.exports = jwtGuard;
module.exports.HEADER = HEADER;
