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
// Phase 4 adds the two READS the HR screens are built on:
//
//   getEvaluationById()     one candidate's full result
//   listEvaluationsByJob()  every candidate for a job, with optional filters
//
// Both LEFT JOIN the resume, so the candidate's details come back in the SAME trip
// to the database rather than a second query (doc 07).
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

/* ------------------------------------------------------------------ *
 * The reads (doc 07) - evaluation + candidate, in one query
 * ------------------------------------------------------------------ */

/**
 * The columns the JOIN pulls from `resumes`, aliased so they cannot collide with
 * the evaluation's own (`id` and `name` exist on both sides).
 *
 * Two columns are deliberately NOT selected: `extracted_text`, which is the whole
 * resume and would bloat every list row for no reader benefit, and `file_path`,
 * which is a server-side disk path and none of an API caller's business.
 */
const CANDIDATE_COLUMNS = `
  r.id                     AS candidate_id,
  r.name                   AS candidate_name,
  r.phone                  AS candidate_phone,
  r.email                  AS candidate_email,
  r.listed_skills          AS candidate_listed_skills,
  r.used_skills            AS candidate_used_skills,
  r.total_experience_years AS candidate_total_experience_years,
  r.uploaded_at            AS candidate_uploaded_at`;

/**
 * A joined row -> the evaluation, with the candidate nested inside it.
 *
 * `candidate` is null when there is no resume yet. That is a real state, not an
 * error: the evaluation row is born before extraction runs (doc 07), so a
 * `processing` row - or one that failed on an unreadable file - genuinely has no
 * candidate facts attached. The nesting keeps the two concerns visibly separate:
 * the evaluation is the verdict, the candidate is the person.
 */
function toEvaluationWithCandidate(row) {
  if (!row) return null;

  const evaluation = toEvaluation(row);
  evaluation.candidate =
    row.candidate_id === null || row.candidate_id === undefined
      ? null
      : {
          resumeId: row.candidate_id,
          name: row.candidate_name,
          phone: row.candidate_phone,
          email: row.candidate_email,
          listedSkills: parseArray(row.candidate_listed_skills),
          usedSkills: parseArray(row.candidate_used_skills),
          totalExperienceYears: row.candidate_total_experience_years,
          uploadedAt: row.candidate_uploaded_at,
        };

  return evaluation;
}

/**
 * SELECT one evaluation with its candidate. Backs GET /api/evaluations/:id, which
 * is also the safety net behind the webhook: if delivery never landed, this is how
 * the caller still gets their result (doc 06).
 *
 * A LEFT JOIN, not an inner one. An inner join would silently hide every evaluation
 * that has no resume row yet - which is exactly the `processing` row the caller
 * polls for after their 202.
 *
 * @returns {Promise<object|null>} null when the id is unknown; the 404 is the service's call
 */
async function getEvaluationById(id) {
  const { rows } = await db.query(
    `SELECT e.*, ${CANDIDATE_COLUMNS}
       FROM evaluations e
       LEFT JOIN resumes r ON r.id = e.resume_id
      WHERE e.id = $1`,
    [id]
  );
  return toEvaluationWithCandidate(rows[0]);
}

/**
 * SELECT every evaluation for one job, newest-and-best first, optionally narrowed.
 *
 * The filters are doc 07's three, and every one of them is a plain scalar column -
 * no JSON is queried, which is what lets the skill bags stay read-whole JSON (doc 02).
 * There is deliberately no skill filter: an eligible candidate already has the
 * required skills, so it would be redundant.
 *
 * Each filter is added as a bound parameter, never interpolated, and an absent
 * filter adds no clause at all - so the default really is "all candidates for this
 * job, near-misses included".
 *
 * One consequence worth naming: a row still `processing` has a NULL percentage and
 * NULL experience, so any numeric filter drops it. That is the honest answer -
 * a filter asks "who is at least 70%", and we do not yet know.
 *
 * @param {number} jobId
 * @param {{eligible?: boolean, minPercentage?: number, minExperience?: number}} [filters]
 */
async function listEvaluationsByJob(jobId, filters = {}) {
  const where = ['e.job_id = $1'];
  const params = [jobId];

  const add = (clause, value) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };

  if (filters.eligible !== undefined) add('e.eligible = ?', Number(Boolean(filters.eligible)));
  if (filters.minPercentage !== undefined) add('e.overall_percentage >= ?', filters.minPercentage);
  if (filters.minExperience !== undefined) {
    add('e.candidate_experience_years >= ?', filters.minExperience);
  }

  const { rows } = await db.query(
    `SELECT e.*, ${CANDIDATE_COLUMNS}
       FROM evaluations e
       LEFT JOIN resumes r ON r.id = e.resume_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.overall_percentage DESC NULLS LAST, e.created_at DESC, e.id DESC`,
    params
  );
  return rows.map(toEvaluationWithCandidate);
}

module.exports = {
  createEvaluation,
  updateEvaluation,
  getEvaluationById,
  listEvaluationsByJob,
  toEvaluation,
  toEvaluationWithCandidate,
};
