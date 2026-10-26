// The guard on the submit door (doc 09).
//
// Two kinds of caller, two mechanisms. HR is a human in a browser and proves who
// they are with a JWT (Phase 5). The ATS is a machine talking to a machine - there
// is nobody to log in - so it proves itself with a secret key in a header.
//
// Phase 7 replaced v1's single shared key (ATS_API_KEY in .env) with one key per
// ATS, stored as a hash in ats_clients and issued by HR. Company A has key A,
// company B has key B; revoking one leaves the other working.
//
// This guard protects exactly one door: POST /api/jobs/:jobId/evaluations. It is the
// only door an outside system may push work through, and every request behind it
// costs us two LLM calls, so it is checked before the upload is even read.
const atsClientService = require('../services/atsClientService');
const { UnauthorizedError } = require('../utils/errors');

const HEADER = 'x-api-key';

async function apiKeyGuard(req, res, next) {
  const provided = req.get(HEADER);
  if (!provided) {
    return next(new UnauthorizedError(`Missing ${HEADER} header`));
  }

  // Unknown and revoked keys get the same answer. Telling them apart would only
  // help someone holding an old key learn that it once worked.
  const client = await atsClientService.authenticate(provided);
  if (!client) {
    return next(new UnauthorizedError('Invalid API key'));
  }

  // Which ATS is knocking, for anything downstream that wants to know.
  req.atsClient = { id: client.id, name: client.name };
  return next();
}

module.exports = apiKeyGuard;
module.exports.HEADER = HEADER;
