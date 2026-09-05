// The ONLY layer that writes SQL for evaluations (doc 07). The busiest repository.
//
// Phase 3 needs the two WRITES that the async lifecycle is built on:
//
//   createEvaluation()  the row is born EMPTY, status='processing', before any work
//                       happens - that is what lets the controller answer 202 with a
//                       real id while the pipeline is still running (doc 05).
//   updateEvaluation()  fills the row in as the pipeline progresses: the resume link,
//                       then the result or the failure, then the webhook outcome.
//
// The two READS (getEvaluationById / listEvaluationsByJob, both JOINing the resume)
// belong to the read doors and arrive with them in Phase 4.
const db = require('../config/db');

/** An evaluations row -> the object the rest of the app uses. */
function toEvaluation(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    resumeId: row.resume_id,
    status: row.status,
    callbackUrl: row.callback_url,
    failureReason: row.failure_reason,
    deliveryStatus: row.delivery_status,
    // SQLite has no boolean type; NULL stays NULL (the result is not in yet).
    eligible: row.eligible === null || row.eligible === undefined ? null : row.eligible === 1,
    matchedRequiredSkills: parseArray(row.matched_required_skills),
    extraSkills: parseArray(row.extra_skills),
    missingSkills: parseArray(row.missing_skills),
    requiredExperienceYears: row.required_experience_years,
    candidateExperienceYears: row.candidate_experience_years,
    overallPercentage: row.overall_percentage,
    createdAt: row.created_at,
  };
}

function parseArray(value) {
  return value === null || value === undefined ? null : JSON.parse(value);
}

/**
 * Every column updateEvaluation is allowed to touch, and how the app's value becomes
 * a column value. A whitelist rather than a loop over the caller's keys: the SET
 * clause is built from THIS map, so a typo (or anything worse) can never reach the SQL.
 */
const UPDATABLE = {
  resumeId: ['resume_id', (v) => v],
  status: ['status', (v) => v],
  failureReason: ['failure_reason', (v) => v],
  deliveryStatus: ['delivery_status', (v) => v],
  eligible: ['eligible', (v) => (v === null ? null : Number(Boolean(v)))],
  matchedRequiredSkills: ['matched_required_skills', json],
  extraSkills: ['extra_skills', json],
  missingSkills: ['missing_skills', json],
  requiredExperienceYears: ['required_experience_years', (v) => v],
  candidateExperienceYears: ['candidate_experience_years', (v) => v],
  overallPercentage: ['overall_percentage', (v) => v],
};

function json(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/**
 * INSERT the row the whole async flow hangs off. Called at the START of the
 * pipeline, before any parsing or LLM work, so an id exists to hand back and to
 * recover by if the process dies mid-run.
 */
async function createEvaluation({ jobId, callbackUrl }) {
  const { rows } = await db.query(
    `INSERT INTO evaluations (job_id, callback_url, status, delivery_status)
     VALUES ($1, $2, 'processing', 'pending')
     RETURNING *`,
    [jobId, callbackUrl]
  );
  return toEvaluation(rows[0]);
}

/**
 * UPDATE whatever the pipeline has learned so far. Partial by design - it is called
 * several times for one row (resume link, then outcome, then delivery status).
 *
 * status and failure_reason must be written together: the table's CHECK enforces
 * that a failed row HAS a reason and a non-failed row has none, so passing one
 * without the other is a constraint error, not a silent half-update.
 *
 * @returns {Promise<object|null>} the updated evaluation, or null if the id is unknown
 */
async function updateEvaluation(id, changes) {
  const sets = [];
  const params = [];

  for (const [field, value] of Object.entries(changes)) {
    const mapping = UPDATABLE[field];
    if (!mapping) continue; // not an updatable column - ignored, never interpolated
    const [column, encode] = mapping;
    params.push(encode(value));
    sets.push(`${column} = $${params.length}`);
  }

  if (sets.length === 0) return null;

  params.push(id);
  const { rows } = await db.query(
    `UPDATE evaluations SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return toEvaluation(rows[0]);
}

// getEvaluationById / listEvaluationsByJob (both JOIN resumes) arrive in Phase 4,
// together with the read doors that need them.
module.exports = { createEvaluation, updateEvaluation, toEvaluation };
