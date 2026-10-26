// Thin traffic layer (doc 05): validated request in, service call, response out.
const atsClientService = require('../services/atsClientService');

/** POST /api/ats-clients -> 201 + { client, apiKey } - the ONLY response that ever shows the key */
async function createClient(req, res) {
  const result = await atsClientService.createClient(req.valid.body);
  res.status(201).json(result);
}

/** GET /api/ats-clients -> 200 + every client (names and status, never keys) */
async function listClients(req, res) {
  const clients = await atsClientService.listClients();
  res.status(200).json(clients);
}

/** POST /api/ats-clients/:id/revoke -> 200 + the revoked client (404 from the service) */
async function revokeClient(req, res) {
  const client = await atsClientService.revokeClient(req.valid.params.id);
  res.status(200).json(client);
}

module.exports = { createClient, listClients, revokeClient };
