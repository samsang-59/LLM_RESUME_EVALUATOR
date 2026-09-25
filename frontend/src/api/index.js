// Every backend door the HR screens use - and only those (doc 10). There is no
// resume-submit function on purpose: that door belongs to the ATS, not this UI.
import { request, tokenStore } from './client';

/* ---------- auth (public doors) ---------- */

/** @returns {Promise<{token: string, user: {id, username, email}}>} */
export function login({ email, password }) {
  return request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
}

/** Registering also signs you in - same { token, user } shape as login. */
export function register({ username, email, password }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: { username, email, password },
    auth: false,
  });
}

/* ---------- jobs ---------- */

export function getJobs() {
  return request('/api/jobs');
}

export function getJobById(jobId) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function createJob(job) {
  return request('/api/jobs', { method: 'POST', body: job });
}

/* ---------- evaluations ---------- */

/**
 * Every candidate for a job, best first. Filters only ever narrow; an unset filter
 * sends nothing, so the default really is "everyone, near-misses included".
 * @param {{eligible?: boolean, minPercentage?: number, minExperience?: number}} [filters]
 */
export function getJobCandidates(jobId, filters = {}) {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/evaluations`, {
    query: {
      eligible: filters.eligible ? 'true' : undefined,
      minPercentage: filters.minPercentage > 0 ? filters.minPercentage : undefined,
      minExperience: filters.minExperience > 0 ? filters.minExperience : undefined,
    },
  });
}

export function getEvaluationById(id) {
  return request(`/api/evaluations/${encodeURIComponent(id)}`);
}

/**
 * JWTs are stateless (doc 09): the server keeps no session to end, so logging out
 * means forgetting the token here. It stays valid until it expires - parked for Phase 7.
 */
export function logout() {
  tokenStore.clear();
}
