// The job doors (doc 03). Each one: guard first, then the controller.
// Phase 5 adds jwtGuard to the HR doors here.
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

// 2 (+5 in Phase 4). Everything that hangs off a job: POST a resume for it, and
// later GET its candidates. A separate router so this file stays about jobs.
router.use('/:jobId/evaluations', require('./evaluationRoutes'));

module.exports = router;
