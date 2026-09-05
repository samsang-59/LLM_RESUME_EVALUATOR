// The evaluation doors that live under a job (doc 03).
//
// Mounted at /api/jobs/:jobId/evaluations, which reads as "create an evaluation
// UNDER this job" - the job context is in the URL rather than hidden in a body field.
// mergeParams is what lets this router still see :jobId from its parent.
const express = require('express');
const validate = require('../middlewares/validate');
const apiKeyGuard = require('../middlewares/apiKeyGuard');
const uploadResume = require('../middlewares/upload');
const { jobIdParamSchema } = require('../validators/jobValidator');
const {
  resumeFileSchema,
  submitEvaluationSchema,
} = require('../validators/evaluationValidator');
const evaluationController = require('../controllers/evaluationController');

const router = express.Router({ mergeParams: true });

// 2. Submit a resume for a job - the whole pipeline lives behind this door.
//
// The order of these five is deliberate, cheapest and most decisive first:
//   apiKeyGuard   an unauthenticated caller is turned away before we read a single
//                 byte of their upload (doc 09)
//   params        a malformed :jobId costs nothing to reject
//   uploadResume  only now do we pull the file off the wire (size-limited, in memory)
//   file          are these bytes really a PDF/DOCX? (content, not name)
//   body          callbackUrl - needed because the answer arrives by webhook
router.post(
  '/',
  apiKeyGuard,
  validate.params(jobIdParamSchema),
  uploadResume,
  validate.file(resumeFileSchema),
  validate.body(submitEvaluationSchema),
  evaluationController.submitEvaluation
);

// 5. GET / (all candidates for this job) arrives in Phase 4, with its filters.

module.exports = router;
