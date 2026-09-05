// Reads the multipart upload off the wire (doc 04, Guard 1).
//
// This is plumbing, not the guard itself: multer turns `multipart/form-data` into
// `req.file` + `req.body`, and enforces the size limit. WHAT the bytes are - a real
// PDF or DOCX rather than a renamed executable - is decided by the validator, which
// looks at the content.
//
// The file is held in MEMORY, not written to a temp directory. The limit is a few
// megabytes, the pipeline needs the whole buffer anyway, and it means a rejected
// upload never touches the disk at all. Only files we accept get written, under a
// name we generate (utils/fileStorage).
const multer = require('multer');
const config = require('../config/env');
const { BadRequestError } = require('../utils/errors');

// The multipart field the file must arrive under.
const FIELD = 'resume';

const single = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxResumeSizeMb * 1024 * 1024,
    files: 1,
    // A resume submission carries one small text field (callbackUrl). Anything with
    // dozens of fields is not a resume submission.
    fields: 10,
  },
}).single(FIELD);

/** multer's own error codes -> our standard 400 body, so callers see one error shape. */
function toBadRequest(err) {
  const message =
    {
      LIMIT_FILE_SIZE: `the resume must be at most ${config.maxResumeSizeMb} MB`,
      LIMIT_FILE_COUNT: 'send exactly one file',
      LIMIT_UNEXPECTED_FILE: `the file must be sent as the "${FIELD}" field`,
      LIMIT_FIELD_COUNT: 'too many form fields',
    }[err.code] || `the upload could not be read: ${err.message}`;

  return new BadRequestError('Validation failed', [{ field: FIELD, message }]);
}

function uploadResume(req, res, next) {
  single(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) return next(toBadRequest(err));
    // A malformed multipart body (busboy failing outright) is still the caller's
    // mistake, not a server fault - a 400, never a 500.
    return next(new BadRequestError('Validation failed', [{ field: FIELD, message: err.message }]));
  });
}

module.exports = uploadResume;
module.exports.FIELD = FIELD;
