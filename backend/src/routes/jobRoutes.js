// The job doors (doc 03). Each one: guard first, then the controller.
// Phase 5 adds jwtGuard here; Phase 3 adds POST /:jobId/evaluations.
const express = require('express');
const validate = require('../middlewares/validate');
const { createJobSchema, jobIdParamSchema } = require('../validators/jobValidator');
const jobController = require('../controllers/jobController');

const router = express.Router();

// 1. HR adds a job
router.post('/', validate.body(createJobSchema), jobController.createJob);

// 3. List jobs (HR dashboard)
router.get('/', jobController.listJobs);

// 4. One job
router.get('/:jobId', validate.params(jobIdParamSchema), jobController.getJob);

module.exports = router;
