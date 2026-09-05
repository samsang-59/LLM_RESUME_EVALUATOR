// Small helpers so the Phase 1 tests read like assertions, not like SQLite trivia.
const db = require('../../src/config/db');

/** Every table name in the database. */
async function tableNames() {
  const { rows } = await db.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return rows.map((r) => r.name);
}

/** Column info for one table, keyed by column name. */
async function columns(table) {
  const { rows } = await db.query(`PRAGMA table_info(${table})`);
  return Object.fromEntries(
    rows.map((r) => [
      r.name,
      { type: r.type, notNull: r.notnull === 1, default: r.dflt_value, pk: r.pk === 1 },
    ])
  );
}

/** Foreign keys declared on a table. */
async function foreignKeys(table) {
  const { rows } = await db.query(`PRAGMA foreign_key_list(${table})`);
  return rows.map((r) => ({
    column: r.from,
    table: r.table,
    references: r.to,
    onDelete: r.on_delete,
  }));
}

/** Index names on a table. */
async function indexes(table) {
  const { rows } = await db.query(`PRAGMA index_list(${table})`);
  return rows.map((r) => r.name);
}

/** The stored CREATE TABLE text - used to prove a CHECK constraint was declared. */
async function tableSql(table) {
  const { rows } = await db.query(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = $1",
    [table]
  );
  return rows[0] ? rows[0].sql : null;
}

/** Insert a valid job and return it. */
async function seedJob(overrides = {}) {
  const job = {
    title: 'Backend Developer',
    must_have_skills: JSON.stringify(['node', 'sql']),
    good_to_have_skills: JSON.stringify(['docker']),
    required_experience_years: 3,
    matching_mode: 'strict',
    cutoff_percentage: 70,
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO jobs (title, must_have_skills, good_to_have_skills,
                       required_experience_years, matching_mode, cutoff_percentage)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      job.title,
      job.must_have_skills,
      job.good_to_have_skills,
      job.required_experience_years,
      job.matching_mode,
      job.cutoff_percentage,
    ]
  );
  return rows[0];
}

/** Insert a valid resume and return it. */
async function seedResume(overrides = {}) {
  const resume = {
    name: 'Asha Rao',
    phone: '+91 90000 00000',
    email: 'asha@example.com',
    file_path: 'uploads/generated-name-1.pdf',
    extracted_text: 'Built REST APIs with Express and Postgres.',
    listed_skills: JSON.stringify(['node', 'sql', 'react']),
    used_skills: JSON.stringify(['node', 'sql']),
    total_experience_years: 4.5,
    ...overrides,
  };
  const { rows } = await db.query(
    `INSERT INTO resumes (name, phone, email, file_path, extracted_text,
                          listed_skills, used_skills, total_experience_years)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      resume.name,
      resume.phone,
      resume.email,
      resume.file_path,
      resume.extracted_text,
      resume.listed_skills,
      resume.used_skills,
      resume.total_experience_years,
    ]
  );
  return rows[0];
}

/** Insert a valid HR user and return it. */
async function seedUser(overrides = {}) {
  const user = {
    username: 'HR Admin',
    email: 'hr@example.com',
    password_hash: '$2b$10$abcdefghijklmnopqrstuv',
    ...overrides,
  };
  const { rows } = await db.query(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
    [user.username, user.email, user.password_hash]
  );
  return rows[0];
}

module.exports = {
  tableNames,
  columns,
  foreignKeys,
  indexes,
  tableSql,
  seedJob,
  seedResume,
  seedUser,
};
