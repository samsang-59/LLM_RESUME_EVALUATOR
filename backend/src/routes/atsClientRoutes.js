// The ATS-client doors (Phase 7): how HR issues and revokes per-ATS API keys.
//
// HR doors, so every one stands behind jwtGuard. The ATS itself never calls these -
// it is software that only ever uses its key on the submit door. A person at the
// company manages the keys, and hands each one to its vendor.
const express = require('express');
const validate = require('../middlewares/validate');
const jwtGuard = require('../middlewares/jwtGuard');
const {
  createAtsClientSchema,
  atsClientIdParamSchema,
} = require('../validators/atsClientValidator');
const atsClientController = require('../controllers/atsClientController');

const router = express.Router();

// Issue a key for a new ATS. The response is the only time the key is shown.
router.post('/', jwtGuard, validate.body(createAtsClientSchema), atsClientController.createClient);

// Every ATS, active and revoked.
router.get('/', jwtGuard, atsClientController.listClients);

// Switch one key off. A revoke, not a DELETE: the row stays as the record.
router.post(
  '/:id/revoke',
  jwtGuard,
  validate.params(atsClientIdParamSchema),
  atsClientController.revokeClient
);

module.exports = router;
