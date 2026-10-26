// Per-ATS API keys (Phase 7, doc 09): company A gets key A, company B gets key B.
//
// v1 had one shared key in .env, so a leak meant changing it for everybody. Now each
// external system has its own key, HR issues and revokes them through the HR doors,
// and switching off one key leaves every other integration running.
const atsClientRepository = require('../repositories/atsClientRepository');
const { generateSecret, hashSecret } = require('../utils/secrets');
const { NotFoundError } = require('../utils/errors');

// Makes a key recognisable at a glance - in a config file, a log, a secret scanner.
const KEY_PREFIX = 'ats_';

/**
 * Issue a key for a new ATS.
 *
 * The plain key is in the return value and NOWHERE else: the database keeps only
 * its hash. This response is the one and only time anybody sees it - HR copies it
 * to the ATS vendor, and if it is lost, the answer is a new key, not a lookup.
 *
 * @returns {Promise<{client: object, apiKey: string}>}
 */
async function createClient({ name }) {
  const apiKey = generateSecret(KEY_PREFIX);
  const client = await atsClientRepository.createAtsClient({ name, keyHash: hashSecret(apiKey) });
  return { client, apiKey };
}

/** Every client, active and revoked - names and status, never keys. */
async function listClients() {
  return atsClientRepository.listAtsClients();
}

/**
 * Switch one client's key off. It stops working on its very next request.
 * @throws {NotFoundError} no such client -> 404
 */
async function revokeClient(id) {
  const existing = await atsClientRepository.getAtsClientById(id);
  if (!existing) throw new NotFoundError(`ATS client ${id} not found`);
  return atsClientRepository.revokeAtsClient(id);
}

/**
 * Who does this key belong to? Used by the submit door's guard.
 *
 * The lookup is by the key's hash, not the key - so the database never compares
 * the secret itself, and how long the lookup takes depends on a hash the caller
 * cannot steer byte by byte. That is what replaced v1's timingSafeEqual.
 *
 * @returns {Promise<object|null>} the active client, or null (unknown OR revoked)
 */
async function authenticate(apiKey) {
  return atsClientRepository.getActiveAtsClientByKeyHash(hashSecret(apiKey));
}

module.exports = { createClient, listClients, revokeClient, authenticate, KEY_PREFIX };
