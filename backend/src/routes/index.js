// Mounts every API router under /api. One place to see the whole surface.
const express = require('express');

const router = express.Router();

router.use('/jobs', require('./jobRoutes'));
// Phase 3: router.use('/jobs/:jobId/evaluations', ...) and /evaluations
// Phase 5: router.use('/auth', ...)

module.exports = router;
