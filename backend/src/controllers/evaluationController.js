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

/**
 * GET /api/jobs/:jobId/evaluations -> 200 + every candidate for the job
 *
 * The filters arrive already parsed by the guard: `eligible` is a real boolean and
 * the two minimums are real numbers, so the service is handed values, not strings
 * off a URL. With no filters this is the full list, near-misses included - the 71%
 * candidate HR might still want to call in (doc 06).
 */
async function listEvaluationsForJob(req, res) {
  const evaluations = await evaluationService.listByJob(
    req.valid.params.jobId,
    req.valid.query
  );
  res.status(200).json(evaluations);
}

/**
 * GET /api/evaluations/:id -> 200 + the evaluation and its candidate (404 from the service)
 *
 * 200 even while the row is still `processing`: the caller was answered 202 and
 * this is where they come to see how it ended. This door is also the backup behind
 * the webhook - if delivery never landed, the result is still here (doc 06).
 */
async function getEvaluation(req, res) {
  const evaluation = await evaluationService.getById(req.valid.params.id);
  res.status(200).json(evaluation);
}

module.exports = { submitEvaluation, listEvaluationsForJob, getEvaluation };
