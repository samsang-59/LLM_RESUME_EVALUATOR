// Business logic for jobs. The validator has already checked the shape, so what is
// left here is the part a guard cannot do: the existence check (docs 04, 05).
const jobRepository = require('../repositories/jobRepository');
const { NotFoundError } = require('../utils/errors');

/** Create a job from already-validated input. */
async function createJob(data) {
  return jobRepository.createJob(data);
}

/** Every job, for the HR dashboard. */
async function listJobs() {
  return jobRepository.listJobs();
}

/**
 * One job by id.
 * Throws NotFound rather than returning null: the controller stays thin and the
 * central error handler turns this into a 404 (doc 05).
 */
async function getJob(id) {
  const job = await jobRepository.getJobById(id);
  if (!job) throw new NotFoundError(`Job ${id} not found`);
  return job;
}

module.exports = { createJob, listJobs, getJob };
