// A valid ATS API key, for the suites that use the submit door.
//
// Since Phase 7 there is no shared key in config: every ATS has its own, issued by
// HR and stored as a hash. This goes through the real service, so the key a test
// holds was made exactly the way a real one is. Issuing keys through the HR door,
// and everything that can go wrong with them, is Phase 7's own test round.
const atsClientService = require('../../src/services/atsClientService');

/** Register an ATS and return its plain API key. */
async function createAtsKey(name = 'Test ATS') {
  const { apiKey } = await atsClientService.createClient({ name });
  return apiKey;
}

module.exports = { createAtsKey };
