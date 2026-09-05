// Mounts every API router under /api. One place to see the whole surface.
const express = require('express');

const router = express.Router();

// Everything job-scoped, including the evaluations that hang off a job
// (/jobs/:jobId/evaluations - mounted inside jobRoutes so the :jobId stays in the URL).
router.use('/jobs', require('./jobRoutes'));
// The one evaluation door addressed by its own id rather than by its job.
router.use('/evaluations', require('./evaluationDetailRoutes'));
// Phase 5: router.use('/auth', ...)

module.exports = router;
