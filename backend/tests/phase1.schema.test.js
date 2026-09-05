const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const { runMigrations, migrationFiles, MIGRATIONS_DIR } = require('../src/config/migrator');
const h = require('./helpers/schema');

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await db.close();
});

// Start every test from a clean slate so row counts and unique checks stay honest.
beforeEach(async () => {
  await db.query('DELETE FROM evaluations');
  await db.query('DELETE FROM resumes');
  await db.query('DELETE FROM jobs');
  await db.query('DELETE FROM users');
});

/* ------------------------------------------------------------------ */
describe('Phase 1 - the migration runner', () => {
  test('there are four migration files, ordered by their numeric prefix', () => {
    expect(migrationFiles()).toEqual([
      '001_create_users.sql',
      '002_create_jobs.sql',
      '003_create_resumes.sql',
      '004_create_evaluations.sql',
    ]);
  });

  test('every migration is recorded in the schema_migrations ledger', async () => {
    const { rows } = await db.query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(migrationFiles());
    rows.forEach((r) => expect(r.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T/));
  });

  test('running again is idempotent - nothing is applied twice', async () => {
    const result = await runMigrations();
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(4);
    expect(result.total).toBe(4);
  });

  test('a broken migration rolls back and is not recorded', async () => {
    const badFile = '999_broken_temp.sql';
    const badPath = path.join(MIGRATIONS_DIR, badFile);
    fs.writeFileSync(
      badPath,
      'CREATE TABLE half_built (id INTEGER PRIMARY KEY);\nTHIS IS NOT SQL;\n'
    );
    try {
      await expect(runMigrations()).rejects.toThrow(/Migration failed: 999_broken_temp\.sql/);

      // The table created before the bad statement must have been rolled back.
      const tables = await h.tableNames();
      expect(tables).not.toContain('half_built');

      // And the ledger must not claim it succeeded.
      const { rows } = await db.query('SELECT name FROM schema_migrations WHERE name = $1', [
        badFile,
      ]);
      expect(rows).toHaveLength(0);
    } finally {
      fs.unlinkSync(badPath);
    }
  });
});

/* ------------------------------------------------------------------ */
describe('Phase 1 - all four tables exist', () => {
  test('users, jobs, resumes, evaluations (+ the ledger) are created', async () => {
    const tables = await h.tableNames();
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'jobs', 'resumes', 'evaluations', 'schema_migrations'])
    );
  });
});

/* ------------------------------------------------------------------ */
describe('Phase 1 - users table (doc 09)', () => {
  test('has every designed column', async () => {
    const cols = await h.columns('users');
    expect(Object.keys(cols).sort()).toEqual(
      ['created_at', 'email', 'id', 'password_hash', 'username'].sort()
    );
    expect(cols.id.pk).toBe(true);
    expect(cols.username.notNull).toBe(true);
    expect(cols.email.notNull).toBe(true);
    expect(cols.password_hash.notNull).toBe(true);
    expect(cols.created_at.notNull).toBe(true);
  });

  test('insert + select a row', async () => {
    const created = await h.seedUser();
    expect(created.id).toEqual(expect.any(Number));
    expect(created.email).toBe('hr@example.com');

    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [created.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe('HR Admin');
  });

  test('created_at is filled in automatically as an ISO timestamp', async () => {
    const user = await h.seedUser();
    expect(user.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('email is UNIQUE - a duplicate is rejected (this becomes the 409 on register)', async () => {
    await h.seedUser({ email: 'taken@example.com' });
    await expect(h.seedUser({ email: 'taken@example.com' })).rejects.toThrow(/UNIQUE/i);
  });

  test('a different email is accepted', async () => {
    await h.seedUser({ email: 'one@example.com' });
    await expect(h.seedUser({ email: 'two@example.com' })).resolves.toMatchObject({
      email: 'two@example.com',
    });
  });

  test('a blank username is rejected', async () => {
    await expect(h.seedUser({ username: '   ' })).rejects.toThrow(/CHECK/i);
  });

  test('the password hash is stored, and there is no plain-password column', async () => {
    const cols = await h.columns('users');
    expect(cols).not.toHaveProperty('password');
    expect(cols).toHaveProperty('password_hash');
  });
});

/* ------------------------------------------------------------------ */
describe('Phase 1 - jobs table (doc 02)', () => {
  test('has every designed column', async () => {
    const cols = await h.columns('jobs');
    expect(Object.keys(cols).sort()).toEqual(
      [
        'id',
        'title',
        'must_have_skills',
        'good_to_have_skills',
        'required_experience_years',
        'matching_mode',
        'cutoff_percentage',
        'created_at',
      ].sort()
    );
    expect(cols.id.pk).toBe(true);
  });

  test('insert + select a row, with the skill bags round-tripping as JSON', async () => {
    const job = await h.seedJob();
    const { rows } = await db.query('SELECT * FROM jobs WHERE id = $1', [job.id]);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].must_have_skills)).toEqual(['node', 'sql']);
    expect(JSON.parse(rows[0].good_to_have_skills)).toEqual(['docker']);
    expect(rows[0].required_experience_years).toBe(3);
  });

  test('matching_mode accepts strict and soft', async () => {
    await expect(h.seedJob({ matching_mode: 'strict' })).resolves.toBeDefined();
    await expect(h.seedJob({ matching_mode: 'soft' })).resolves.toBeDefined();
  });

  test('matching_mode rejects anything else (the enum)', async () => {
    await expect(h.seedJob({ matching_mode: 'maybe' })).rejects.toThrow(/CHECK/i);
    await expect(h.seedJob({ matching_mode: '' })).rejects.toThrow(/CHECK/i);
  });

  test('cutoff_percentage must be between 0 and 100', async () => {
    await expect(h.seedJob({ cutoff_percentage: 0 })).resolves.toBeDefined();
    await expect(h.seedJob({ cutoff_percentage: 100 })).resolves.toBeDefined();
    await expect(h.seedJob({ cutoff_percentage: -1 })).rejects.toThrow(/CHECK/i);
    await expect(h.seedJob({ cutoff_percentage: 101 })).rejects.toThrow(/CHECK/i);
  });

  test('required experience allows decimals but never a negative', async () => {
    await expect(h.seedJob({ required_experience_years: 1.5 })).resolves.toMatchObject({
      required_experience_years: 1.5,
    });
    await expect(h.seedJob({ required_experience_years: -1 })).rejects.toThrow(/CHECK/i);
  });

  test('must-have skills cannot be an empty list (such a job is unmatchable)', async () => {
    await expect(h.seedJob({ must_have_skills: '[]' })).rejects.toThrow(/CHECK/i);
  });

  test('good-to-have skills MAY be empty (it is only a bonus)', async () => {
    await expect(h.seedJob({ good_to_have_skills: '[]' })).resolves.toBeDefined();
  });

  test('the skill bags must be JSON arrays, not objects or loose text', async () => {
    await expect(h.seedJob({ must_have_skills: '{"a":1}' })).rejects.toThrow(/CHECK/i);
    await expect(h.seedJob({ must_have_skills: 'node, sql' })).rejects.toThrow(/CHECK/i);
  });

  test('defaults apply when the optional fields are omitted', async () => {
    const { rows } = await db.query(
      `INSERT INTO jobs (title, must_have_skills, matching_mode, cutoff_percentage)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      ['Intern', JSON.stringify(['html']), 'soft', 50]
    );
    expect(rows[0].good_to_have_skills).toBe('[]');
    expect(rows[0].required_experience_years).toBe(0);
    expect(rows[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('a blank title is rejected, but digits inside a title are fine', async () => {
    await expect(h.seedJob({ title: '  ' })).rejects.toThrow(/CHECK/i);
    await expect(h.seedJob({ title: 'Backend Developer 2026' })).resolves.toMatchObject({
      title: 'Backend Developer 2026',
    });
  });
});

/* ------------------------------------------------------------------ */
describe('Phase 1 - resumes table (doc 02)', () => {
  test('has every designed column', async () => {
    const cols = await h.columns('resumes');
    expect(Object.keys(cols).sort()).toEqual(
      [
        'id',
        'name',
        'phone',
        'email',
        'file_path',
        'extracted_text',
        'listed_skills',
        'used_skills',
        'total_experience_years',
        'uploaded_at',
      ].sort()
    );
  });

  test('insert + select a row, with both skill lists round-tripping', async () => {
    const resume = await h.seedResume();
    const { rows } = await db.query('SELECT * FROM resumes WHERE id = $1', [resume.id]);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].listed_skills)).toEqual(['node', 'sql', 'react']);
    expect(JSON.parse(rows[0].used_skills)).toEqual(['node', 'sql']);
    expect(rows[0].total_experience_years).toBe(4.5);
  });

  test('name / phone / email are nullable - the LLM may not find them on a resume', async () => {
    const cols = await h.columns('resumes');
    expect(cols.name.notNull).toBe(false);
    expect(cols.phone.notNull).toBe(false);
    expect(cols.email.notNull).toBe(false);
    await expect(h.seedResume({ name: null, phone: null, email: null })).resolves.toBeDefined();
  });

  test('file_path and extracted_text are required', async () => {
    const cols = await h.columns('resumes');
    expect(cols.file_path.notNull).toBe(true);
    expect(cols.extracted_text.notNull).toBe(true);
    await expect(h.seedResume({ file_path: null })).rejects.toThrow(/NOT NULL/i);
    await expect(h.seedResume({ extracted_text: null })).rejects.toThrow(/NOT NULL/i);
  });

  test('candidate experience can never be negative', async () => {
    await expect(h.seedResume({ total_experience_years: -0.5 })).rejects.toThrow(/CHECK/i);
  });

  test('resume email is NOT unique - the same person may apply to several jobs', async () => {
    await h.seedResume({ email: 'same@example.com' });
    await expect(h.seedResume({ email: 'same@example.com' })).resolves.toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
describe('Phase 1 - evaluations table (docs 02, 05, 06)', () => {
  test('has every designed column', async () => {
    const cols = await h.columns('evaluations');
    expect(Object.keys(cols).sort()).toEqual(
      [
        'id',
        'job_id',
        'resume_id',
        'status',
        'callback_url',
        'failure_reason',
        'delivery_status',
        'eligible',
        'matched_required_skills',
        'extra_skills',
        'missing_skills',
        'required_experience_years',
        'candidate_experience_years',
        'overall_percentage',
        'created_at',
      ].sort()
    );
  });

  test('declares both foreign keys', async () => {
    const fks = await h.foreignKeys('evaluations');
    expect(fks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: 'job_id', table: 'jobs', references: 'id' }),
        expect.objectContaining({ column: 'resume_id', table: 'resumes', references: 'id' }),
      ])
    );
  });

  test('has the indexes the read doors will need', async () => {
    const names = await h.indexes('evaluations');
    expect(names).toEqual(
      expect.arrayContaining(['idx_evaluations_job_id', 'idx_evaluations_resume_id'])
    );
  });

  // The async flow: the row is born before the work is done.
  test('a row can be created with only job_id + callback_url (the 202 moment)', async () => {
    const job = await h.seedJob();
    const { rows } = await db.query(
      'INSERT INTO evaluations (job_id, callback_url) VALUES ($1, $2) RETURNING *',
      [job.id, 'https://ats.example.com/hooks/1']
    );
    const row = rows[0];
    expect(row.id).toEqual(expect.any(Number));
    expect(row.status).toBe('processing'); // default
    expect(row.delivery_status).toBe('pending'); // default
    expect(row.resume_id).toBe(null); // the resume does not exist yet
    expect(row.overall_percentage).toBe(null); // no result yet
    expect(row.eligible).toBe(null);
  });

  test('the foreign keys are enforced, not just declared', async () => {
    await expect(
      db.query('INSERT INTO evaluations (job_id, callback_url) VALUES ($1, $2)', [
        9999,
        'https://ats.example.com/hooks/1',
      ])
    ).rejects.toThrow(/FOREIGN KEY/i);

    const job = await h.seedJob();
    await expect(
      db.query('INSERT INTO evaluations (job_id, resume_id, callback_url) VALUES ($1, $2, $3)', [
        job.id,
        9999,
        'https://ats.example.com/hooks/1',
      ])
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  test('a job that has evaluations cannot be deleted (past results stay intact)', async () => {
    const job = await h.seedJob();
    await db.query('INSERT INTO evaluations (job_id, callback_url) VALUES ($1, $2)', [
      job.id,
      'https://ats.example.com/hooks/1',
    ]);
    await expect(db.query('DELETE FROM jobs WHERE id = $1', [job.id])).rejects.toThrow(
      /FOREIGN KEY/i
    );
  });

  test('callback_url is required', async () => {
    const job = await h.seedJob();
    await expect(db.query('INSERT INTO evaluations (job_id) VALUES ($1)', [job.id])).rejects.toThrow(
      /NOT NULL/i
    );
  });

  test('the status enum accepts only processing / completed / failed', async () => {
    const job = await h.seedJob();
    const insert = (status, failureReason = null) =>
      db.query(
        'INSERT INTO evaluations (job_id, callback_url, status, failure_reason) VALUES ($1, $2, $3, $4)',
        [job.id, 'https://ats.example.com/h', status, failureReason]
      );
    await expect(insert('processing')).resolves.toBeDefined();
    await expect(insert('completed')).resolves.toBeDefined();
    await expect(insert('failed', 'network')).resolves.toBeDefined();
    await expect(insert('done')).rejects.toThrow(/CHECK/i);
  });

  test('the delivery_status enum accepts only pending / delivered / failed', async () => {
    const job = await h.seedJob();
    const insert = (delivery) =>
      db.query(
        'INSERT INTO evaluations (job_id, callback_url, delivery_status) VALUES ($1, $2, $3)',
        [job.id, 'https://ats.example.com/h', delivery]
      );
    await expect(insert('pending')).resolves.toBeDefined();
    await expect(insert('delivered')).resolves.toBeDefined();
    await expect(insert('failed')).resolves.toBeDefined();
    await expect(insert('sent')).rejects.toThrow(/CHECK/i);
  });

  test('failure_reason is tied to status=failed, in both directions', async () => {
    const job = await h.seedJob();
    const insert = (status, failureReason) =>
      db.query(
        'INSERT INTO evaluations (job_id, callback_url, status, failure_reason) VALUES ($1, $2, $3, $4)',
        [job.id, 'https://ats.example.com/h', status, failureReason]
      );
    // failed must carry a reason
    await expect(insert('failed', null)).rejects.toThrow(/CHECK/i);
    // a non-failed row must not carry one
    await expect(insert('completed', 'network')).rejects.toThrow(/CHECK/i);
    // the valid pairing
    await expect(insert('failed', 'unreadable_resume')).resolves.toBeDefined();
  });

  test('eligible is a strict 0/1 boolean', async () => {
    const job = await h.seedJob();
    const insert = (eligible) =>
      db.query('INSERT INTO evaluations (job_id, callback_url, eligible) VALUES ($1, $2, $3)', [
        job.id,
        'https://ats.example.com/h',
        eligible,
      ]);
    await expect(insert(0)).resolves.toBeDefined();
    await expect(insert(1)).resolves.toBeDefined();
    await expect(insert(2)).rejects.toThrow(/CHECK/i);
  });

  test('overall_percentage must stay within 0-100', async () => {
    const job = await h.seedJob();
    const insert = (pct) =>
      db.query(
        'INSERT INTO evaluations (job_id, callback_url, overall_percentage) VALUES ($1, $2, $3)',
        [job.id, 'https://ats.example.com/h', pct]
      );
    await expect(insert(0)).resolves.toBeDefined();
    await expect(insert(71.25)).resolves.toBeDefined();
    await expect(insert(100)).resolves.toBeDefined();
    await expect(insert(120)).rejects.toThrow(/CHECK/i);
    await expect(insert(-5)).rejects.toThrow(/CHECK/i);
  });

  test('the full lifecycle: processing -> completed with a result -> delivered', async () => {
    const job = await h.seedJob();

    // 1. born at the 202 moment
    const created = (
      await db.query('INSERT INTO evaluations (job_id, callback_url) VALUES ($1, $2) RETURNING *', [
        job.id,
        'https://ats.example.com/hooks/1',
      ])
    ).rows[0];
    expect(created.status).toBe('processing');

    // 2. extraction produced a resume; the pipeline attaches it and stores the result
    const resume = await h.seedResume();
    await db.query(
      `UPDATE evaluations
          SET resume_id = $1, status = $2, eligible = $3,
              matched_required_skills = $4, extra_skills = $5, missing_skills = $6,
              required_experience_years = $7, candidate_experience_years = $8,
              overall_percentage = $9
        WHERE id = $10`,
      [
        resume.id,
        'completed',
        1,
        JSON.stringify(['node', 'sql']),
        JSON.stringify(['react']),
        JSON.stringify([]),
        3,
        4.5,
        87.5,
        created.id,
      ]
    );

    // 3. the webhook went out
    await db.query('UPDATE evaluations SET delivery_status = $1 WHERE id = $2', [
      'delivered',
      created.id,
    ]);

    const row = (await db.query('SELECT * FROM evaluations WHERE id = $1', [created.id])).rows[0];
    expect(row.status).toBe('completed');
    expect(row.delivery_status).toBe('delivered');
    expect(row.eligible).toBe(1);
    expect(row.overall_percentage).toBe(87.5);
    expect(JSON.parse(row.matched_required_skills)).toEqual(['node', 'sql']);
    expect(JSON.parse(row.missing_skills)).toEqual([]);
    // the snapshots, frozen at this moment
    expect(row.required_experience_years).toBe(3);
    expect(row.candidate_experience_years).toBe(4.5);
  });

  test('the failure path: processing -> failed with a reason', async () => {
    const job = await h.seedJob();
    const created = (
      await db.query('INSERT INTO evaluations (job_id, callback_url) VALUES ($1, $2) RETURNING *', [
        job.id,
        'https://ats.example.com/hooks/1',
      ])
    ).rows[0];

    await db.query('UPDATE evaluations SET status = $1, failure_reason = $2 WHERE id = $3', [
      'failed',
      'unreadable_resume',
      created.id,
    ]);

    const row = (await db.query('SELECT * FROM evaluations WHERE id = $1', [created.id])).rows[0];
    expect(row.status).toBe('failed');
    expect(row.failure_reason).toBe('unreadable_resume');
    expect(row.resume_id).toBe(null);
  });

  test('the JOIN the read doors rely on returns evaluation + candidate together', async () => {
    const job = await h.seedJob();
    const resume = await h.seedResume({ name: 'Ravi Kumar' });
    await db.query(
      `INSERT INTO evaluations (job_id, resume_id, callback_url, status, eligible, overall_percentage)
       VALUES ($1, $2, $3, 'completed', 1, 82)`,
      [job.id, resume.id, 'https://ats.example.com/h']
    );

    const { rows } = await db.query(
      `SELECT e.id, e.overall_percentage, e.eligible,
              r.name AS candidate_name, r.email AS candidate_email,
              j.title AS job_title
         FROM evaluations e
         JOIN resumes r ON r.id = e.resume_id
         JOIN jobs    j ON j.id = e.job_id
        WHERE e.job_id = $1`,
      [job.id]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].candidate_name).toBe('Ravi Kumar');
    expect(rows[0].job_title).toBe('Backend Developer');
    expect(rows[0].overall_percentage).toBe(82);
  });
});
