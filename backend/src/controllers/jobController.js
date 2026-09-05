// Thin traffic layer (doc 05): take the validated request, call the service, respond.
// No business logic, no SQL, and no try/catch - Express 5 forwards a rejected promise
// to the central error handler, which picks the status code.
const jobService = require('../services/jobService');

/** POST /api/jobs -> 201 + the created job */
async function createJob(req, res) {
  const job = await jobService.createJob(req.valid.body);
  res.status(201).json(job);
}

/** GET /api/jobs -> 200 + the list */
async function listJobs(req, res) {
  const jobs = await jobService.listJobs();
  res.status(200).json(jobs);
}

/** GET /api/jobs/:jobId -> 200 + the job (404 comes from the service) */
async function getJob(req, res) {
  const job = await jobService.getJob(req.valid.params.jobId);
  res.status(200).json(job);
}

module.exports = { createJob, listJobs, getJob };
