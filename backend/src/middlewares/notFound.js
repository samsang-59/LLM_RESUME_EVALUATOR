// Anything that matched no route falls through to here.
const { NotFoundError } = require('../utils/errors');

function notFound(req, res, next) {
  next(new NotFoundError(`No route for ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
