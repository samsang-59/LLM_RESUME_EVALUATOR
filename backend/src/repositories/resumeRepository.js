// The ONLY layer that writes SQL for resumes (doc 07). One function per query.
//
// Just one function, and that is deliberate: there is no getResumeById. When HR
// views a result the candidate's details arrive through a JOIN inside the
// evaluation reads, not a second trip to the database (doc 07).
const db = require('../config/db');

/** A resumes row -> the object the rest of the app uses (snake_case + JSON text -> camelCase + arrays). */
function toResume(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    filePath: row.file_path,
    extractedText: row.extracted_text,
    listedSkills: JSON.parse(row.listed_skills),
    usedSkills: JSON.parse(row.used_skills),
    totalExperienceYears: row.total_experience_years,
    uploadedAt: row.uploaded_at,
  };
}

/**
 * INSERT the extracted resume. Called by the pipeline once extraction has succeeded
 * - never before, because until then there are no candidate facts to store.
 */
async function createResume(data) {
  const { rows } = await db.query(
    `INSERT INTO resumes (name, phone, email, file_path, extracted_text,
                          listed_skills, used_skills, total_experience_years)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.name ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.filePath,
      data.extractedText,
      JSON.stringify(data.listedSkills || []),
      JSON.stringify(data.usedSkills || []),
      data.totalExperienceYears ?? 0,
    ]
  );
  return toResume(rows[0]);
}

module.exports = { createResume, toResume };
