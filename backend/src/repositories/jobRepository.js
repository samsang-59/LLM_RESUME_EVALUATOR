// The ONLY layer that writes SQL for jobs (doc 07). One function per query.
//
// It also owns the translation between the two shapes:
//   DB       snake_case columns, skill bags as JSON text
//   the app  camelCase fields,   skill bags as real arrays
// Keeping that here means the Postgres move (where jsonb comes back already parsed)
// is a change to this file only - services and controllers never notice.
const db = require('../config/db');

/** A jobs row -> the job object the rest of the app uses. */
function toJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    mustHaveSkills: JSON.parse(row.must_have_skills),
    goodToHaveSkills: JSON.parse(row.good_to_have_skills),
    requiredExperienceYears: row.required_experience_years,
    matchingMode: row.matching_mode,
    cutoffPercentage: row.cutoff_percentage,
    createdAt: row.created_at,
    // Only the list query selects it (the dashboard's job cards). Number() because
    // Postgres returns COUNT(*) as a bigint string.
    ...(row.candidate_count !== undefined && { candidateCount: Number(row.candidate_count) }),
  };
}

/** INSERT a new job. Called by POST /api/jobs. */
async function createJob(data) {
  const { rows } = await db.query(
    `INSERT INTO jobs (title, must_have_skills, good_to_have_skills,
                       required_experience_years, matching_mode, cutoff_percentage)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.title,
      JSON.stringify(data.mustHaveSkills),
      JSON.stringify(data.goodToHaveSkills),
      data.requiredExperienceYears,
      data.matchingMode,
      data.cutoffPercentage,
    ]
  );
  return toJob(rows[0]);
}

/**
 * SELECT all jobs, newest first - HR's dashboard. Each job carries how many
 * evaluations it has (every status counted), so a card can say "7 candidates"
 * without the frontend making one request per job.
 */
async function listJobs() {
  const { rows } = await db.query(
    `SELECT j.*,
            (SELECT COUNT(*) FROM evaluations e WHERE e.job_id = j.id) AS candidate_count
       FROM jobs j
      ORDER BY j.created_at DESC, j.id DESC`
  );
  return rows.map(toJob);
}

/**
 * SELECT one job. Returns null when it does not exist - turning that into a 404 is
 * the service's job, not the repository's.
 * Used by GET /api/jobs/:jobId and, later, by the pipeline's existence check.
 */
async function getJobById(id) {
  const { rows } = await db.query('SELECT * FROM jobs WHERE id = $1', [id]);
  return toJob(rows[0]);
}

// No updateJob: jobs are immutable in v1 (doc 07). HR creates a new job instead.
module.exports = { createJob, listJobs, getJobById, toJob };
