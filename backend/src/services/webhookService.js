// STEP 5 of the pipeline: tell the caller (doc 06).
//
// The caller was answered 202 and hung up long ago, so this POST is how they find
// out what happened. It fires on BOTH outcomes - a completed evaluation carries the
// result, a failed one carries the reason. Silence is never an answer.
//
// This is best-effort by nature: we are calling someone else's server. So failures
// are classified the same way the LLM's are -
//
//   transient (their box is down, a timeout, a 5xx, a 429)  -> retry with backoff
//   permanent (a bad URL, a 404, a 401, any other 4xx)      -> give up immediately
//
// ...and the outcome is recorded in evaluations.delivery_status, so nothing is
// merely lost. The safety net behind all of it: the result is written to OUR
// database BEFORE this runs. If delivery never gets through, the caller can still
// pull the result from GET /api/evaluations/:id. Webhook is primary, the read door
// is backup, and nothing is ever unrecoverable.
const config = require('../config/env');

const DELIVERY = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED: 'failed',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff: base, 2x base, 4x base ... (0 in tests, so they stay fast). */
function backoffMs(attempt) {
  return config.webhookRetryBaseMs * 2 ** attempt;
}

/**
 * Is this HTTP status worth trying again?
 * 5xx = their server broke and may recover. 408/429 = "not now, later".
 * Every other 4xx is us being wrong about their URL, and no amount of retrying
 * turns a 404 into a 200.
 */
function isTransientStatus(status) {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * The body we POST. Deliberately flat and self-describing: the receiver gets the
 * evaluation id (so they can correlate, or fall back to the read door) plus either
 * the result or the reason - never a half-filled result object.
 */
function buildPayload(evaluation, extras = {}) {
  const base = {
    evaluationId: evaluation.id,
    jobId: evaluation.jobId,
    status: evaluation.status,
  };

  if (evaluation.status === 'failed') {
    return { ...base, failureReason: evaluation.failureReason };
  }

  return {
    ...base,
    result: {
      eligible: evaluation.eligible,
      overallPercentage: evaluation.overallPercentage,
      matchedRequiredSkills: evaluation.matchedRequiredSkills,
      missingSkills: evaluation.missingSkills,
      extraSkills: evaluation.extraSkills,
      requiredExperienceYears: evaluation.requiredExperienceYears,
      candidateExperienceYears: evaluation.candidateExperienceYears,
      ...extras,
    },
  };
}

/**
 * POST the outcome to the caller's callbackUrl, retrying only what is worth retrying.
 *
 * It never throws: a webhook that could not be delivered is a recorded fact, not a
 * pipeline failure. The evaluation itself already succeeded or failed on its own
 * merits, and re-labelling it because someone else's server is down would be a lie.
 *
 * @returns {Promise<{deliveryStatus: 'delivered'|'failed', attempts: number, error?: string}>}
 */
async function deliver(callbackUrl, payload) {
  let lastError;

  for (let attempt = 0; attempt <= config.webhookMaxRetries; attempt += 1) {
    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.webhookTimeoutMs),
      });

      if (response.ok) {
        return { deliveryStatus: DELIVERY.DELIVERED, attempts: attempt + 1 };
      }

      lastError = `responded ${response.status}`;
      if (!isTransientStatus(response.status)) {
        return { deliveryStatus: DELIVERY.FAILED, attempts: attempt + 1, error: lastError };
      }
    } catch (err) {
      // No response at all: DNS failure, refused connection, timeout. Their side may
      // simply be restarting, so this is the transient case.
      lastError = err.message;
    }

    if (attempt < config.webhookMaxRetries) await sleep(backoffMs(attempt));
  }

  return {
    deliveryStatus: DELIVERY.FAILED,
    attempts: config.webhookMaxRetries + 1,
    error: lastError,
  };
}

module.exports = { deliver, buildPayload, isTransientStatus, DELIVERY };
