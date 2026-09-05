// Turns a Zod schema into an Express guard (doc 04).
//
// A guard runs BEFORE the controller. If the input is the wrong shape the request is
// rejected right here - no controller, no service, no DB hit, and no wasted (paid)
// LLM call.
//
// The parsed result is put on `req.valid`, never written back over `req.body` /
// `req.params`, so nothing downstream can confuse raw input with checked input.
const { BadRequestError } = require('../utils/errors');

/** Zod issues -> a flat, frontend-friendly list of {field, message}. */
function formatIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : '(body)',
    message: issue.message,
  }));
}

function guard(schema, source) {
  return function validateRequest(req, res, next) {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return next(new BadRequestError('Validation failed', formatIssues(result.error)));
    }

    req.valid = req.valid || {};
    req.valid[source] = result.data;
    return next();
  };
}

module.exports = {
  body: (schema) => guard(schema, 'body'),
  params: (schema) => guard(schema, 'params'),
  query: (schema) => guard(schema, 'query'),
  // The upload, as multer left it on `req.file`. Same contract as the others, so
  // the checked file lands on req.valid.file and the raw one is never used again.
  file: (schema) => guard(schema, 'file'),
  formatIssues,
};
