// Thin traffic layer (doc 05): take the validated request, call the service, respond.
//
// The interesting thing about this controller is what it does NOT do: it never waits
// for the pipeline. The service starts the background run and returns an id; the
// controller answers 202 immediately and the connection closes. Parsing, two LLM
// calls, scoring and the webhook all happen after this function has already returned.
const evaluationService = require('../services/evaluationService');

/**
 * POST /api/jobs/:jobId/evaluations -> 202 + { evaluationId, status: "processing" }
 *
 * 202 Accepted, not 201 Created: "I have taken this and will work on it", which is
 * the honest answer when the result does not exist yet. A 404 for an unknown job
 * comes from the service, through the central error handler.
 */
async function submitEvaluation(req, res) {
  const accepted = await evaluationService.startEvaluation({
    jobId: req.valid.params.jobId,
    file: req.valid.file,
    callbackUrl: req.valid.body.callbackUrl,
  });

  res.status(202).json(accepted);
}

module.exports = { submitEvaluation };
