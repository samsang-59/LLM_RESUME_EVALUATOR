// Every backend door the HR screens use - and only those (doc 10). There is no
// resume-submit function on purpose: that door belongs to the ATS, not this UI.
import { request, tokenStore } from './client';

/* ---------- auth (public doors) ---------- */

/** @returns {Promise<{token: string, refreshToken: string, user: {id, username, email}}>} */
export function login({ email, password }) {
  return request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
}

/** Registering also signs you in - same { token, refreshToken, user } shape as login. */
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
 * Log out: forget both tokens here, and revoke the refresh token on the server
 * (POST /api/auth/logout, Phase 7) so it can never be traded again. The access JWT
 * is stateless and cannot be revoked; it simply runs out within its 15 minutes.
 *
 * The local half happens first and unconditionally - a server that cannot be
 * reached must not keep anyone signed in on this machine.
 */
export async function logout() {
  const refreshToken = tokenStore.getRefresh();
  tokenStore.clear();
  if (!refreshToken) return;
  await request('/api/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
  }).catch(() => {});
}
