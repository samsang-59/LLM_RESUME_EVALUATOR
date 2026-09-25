// The job doors (doc 03). Each one: guard first, then the controller.
//
// Every door in this file is an HR door, so every one of them stands behind
// jwtGuard (doc 09). It is named on each route rather than applied to the whole
// router on purpose: the evaluations router mounted at the bottom holds the ATS
// submit door, which answers to an API key instead - and a guard applied here
// would silently cover it too.
const express = require('express');
const validate = require('../middlewares/validate');
const jwtGuard = require('../middlewares/jwtGuard');
const { createJobSchema, jobIdParamSchema } = require('../validators/jobValidator');
const jobController = require('../controllers/jobController');

const router = express.Router();

// 1. HR adds a job
router.post('/', jwtGuard, validate.body(createJobSchema), jobController.createJob);

// 3. List jobs (HR dashboard)
router.get('/', jwtGuard, jobController.listJobs);

// 4. One job
router.get('/:jobId', jwtGuard, validate.params(jobIdParamSchema), jobController.getJob);

// 2 and 5. Everything that hangs off a job: POST a resume for it, and GET its
// candidates. A separate router so this file stays about jobs.
router.use('/:jobId/evaluations', require('./evaluationRoutes'));

module.exports = router;
