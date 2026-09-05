// The central error handler (doc 05). Mounted last, after every route.
// Known AppErrors become their own status; anything else is a 500 and is logged.
const { AppError } = require('../utils/errors');
const config = require('../config/env');

// eslint-disable-next-line no-unused-vars -- Express identifies handlers by arity.
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    const body = { error: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    return res.status(err.status).json(body);
  }

  // Unexpected: never leak internals to the caller, but do record it.
  if (!config.isTest) {
    // eslint-disable-next-line no-console
    console.error('[error] unexpected:', err);
  }
  return res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
}

module.exports = errorHandler;
