// The guard on the submit door (doc 09).
//
// Two kinds of caller, two mechanisms. HR is a human in a browser and proves who
// they are with a JWT (Phase 5). The ATS is a machine talking to a machine - there
// is nobody to log in - so it proves itself with a shared secret in a header.
//
// This guard protects exactly one door: POST /api/jobs/:jobId/evaluations. It is the
// only door an outside system may push work through, and every request behind it
// costs us two LLM calls, so it is checked before the upload is even read.
const crypto = require('crypto');
const config = require('../config/env');
const { UnauthorizedError } = require('../utils/errors');

const HEADER = 'x-api-key';

/**
 * Compare without leaking the answer through timing.
 *
 * A plain `===` on strings stops at the first differing character, so how long it
 * takes tells an attacker how much of the key they guessed right - enough to
 * recover it one character at a time. timingSafeEqual always looks at every byte.
 * Lengths must match first, since the function refuses unequal buffers (and a
 * length difference is not a secret worth protecting).
 */
function matches(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function apiKeyGuard(req, res, next) {
  // No key configured means the door cannot be opened by anybody. Failing CLOSED is
  // the only safe reading of a missing secret - the alternative would quietly turn
  // an unconfigured deployment into an open one.
  if (!config.atsApiKey) {
    return next(new UnauthorizedError('Resume submission is not configured on this server'));
  }

  const provided = req.get(HEADER);
  if (!provided) {
    return next(new UnauthorizedError(`Missing ${HEADER} header`));
  }

  if (!matches(provided, config.atsApiKey)) {
    return next(new UnauthorizedError('Invalid API key'));
  }

  return next();
}

module.exports = apiKeyGuard;
module.exports.HEADER = HEADER;
