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

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
};
