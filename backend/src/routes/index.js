// Mounts every API router under /api. One place to see the whole surface.
const express = require('express');

const router = express.Router();

// Everything job-scoped, including the evaluations that hang off a job
// (/jobs/:jobId/evaluations - mounted inside jobRoutes so the :jobId stays in the URL).
router.use('/jobs', require('./jobRoutes'));
// The one evaluation door addressed by its own id rather than by its job.
router.use('/evaluations', require('./evaluationDetailRoutes'));
// The only unguarded doors: register and login (doc 09).
router.use('/auth', require('./authRoutes'));

module.exports = router;
