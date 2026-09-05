// Typed errors (doc 05). Services throw these; the central error handler maps them
// to HTTP status codes so controllers stay thin and free of try/catch.

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 400 - a guard failed, or the input is unusable.
class BadRequestError extends AppError {
  constructor(message = 'Bad request', details) {
    super(400, 'bad_request', message, details);
  }
}

// 401 - missing / invalid JWT or API key.
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details) {
    super(401, 'unauthorized', message, details);
  }
}

// 404 - the job or evaluation does not exist (existence checks live in services).
class NotFoundError extends AppError {
  constructor(message = 'Not found', details) {
    super(404, 'not_found', message, details);
  }
}

// 409 - e.g. registering an email that is already taken.
class ConflictError extends AppError {
  constructor(message = 'Conflict', details) {
    super(409, 'conflict', message, details);
  }
}

/* ------------------------------------------------------------------ *
 * Phase 3 - the pipeline's own error vocabulary
 *
 * These are NOT HTTP errors. By the time the pipeline runs, the caller has
 * already been told 202 and hung up (doc 05), so there is nobody left to give a
 * status code to. What matters instead is WHY it failed, because that string is
 * written to evaluations.failure_reason and posted to the webhook (doc 06).
 * ------------------------------------------------------------------ */

// The closed set doc 06 defines. Anything outside it would be a bug, not a case.
const FAILURE_REASONS = Object.freeze({
  // The file held no usable text - empty, or a scan/photo of text. We reject
  // rather than OCR: it is the candidate's responsibility and it costs us nothing.
  UNREADABLE_RESUME: 'unreadable_resume',
  // The LLM could not be reached (network / timeout) after the retries.
  NETWORK: 'network',
  // The LLM answered "busy" (429 / 503) after the retries.
  LLM_OVERLOADED: 'llm_overloaded',
  // The LLM answered, but not in the shape we demanded. Never retried - fail fast.
  MALFORMED_OUTPUT: 'malformed_output',
  // A bug on our side. Recorded honestly rather than disguised as one of the above.
  INTERNAL: 'internal_error',
});

const FAILURE_REASON_VALUES = Object.freeze(Object.values(FAILURE_REASONS));

/**
 * A step of the pipeline gave up. Carries the reason that will be stored.
 * `retryable` is set by the LLM adapter so the caller knows whether it already
 * exhausted its retries or simply must not retry at all.
 */
class PipelineError extends Error {
  constructor(failureReason, message, { cause, retryable = false } = {}) {
    super(message || failureReason);
    this.name = 'PipelineError';
    this.failureReason = failureReason;
    this.retryable = retryable;
    if (cause !== undefined) this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  PipelineError,
  FAILURE_REASONS,
  FAILURE_REASON_VALUES,
};
