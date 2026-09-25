// The one evaluation door that does NOT hang off a job (doc 03 #6).
//
// GET /api/evaluations/:id is addressed by the evaluation's own id, because that is
// the id the submitter was handed in the 202 - they have it, and they should not
// need to remember which job it belonged to in order to ask about it. Everything
// job-scoped lives in evaluationRoutes.js instead.
//
// This is also the door doc 06 calls the safety net: the result is written to our
// database before the webhook is attempted, so a delivery that never lands costs
// nobody the result. Webhook primary, this read door backup.
const express = require('express');
const validate = require('../middlewares/validate');
const jwtGuard = require('../middlewares/jwtGuard');
const { evaluationIdParamSchema } = require('../validators/evaluationValidator');
const evaluationController = require('../controllers/evaluationController');

const router = express.Router();

// 6. One candidate's full result, with the candidate joined in.
//
// An HR door, so jwtGuard first: an anonymous caller is turned away before we look
// at their id at all. Then the shape check - whether the evaluation exists is the
// service's lookup, which is what makes a malformed id a 400 and an unknown one a 404.
router.get(
  '/:id',
  jwtGuard,
  validate.params(evaluationIdParamSchema),
  evaluationController.getEvaluation
);

module.exports = router;
