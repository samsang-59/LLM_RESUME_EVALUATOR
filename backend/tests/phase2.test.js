const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/config/db');
const { runMigrations } = require('../src/config/migrator');
const jobRepository = require('../src/repositories/jobRepository');
const jobService = require('../src/services/jobService');
const { NotFoundError } = require('../src/utils/errors');

const app = createApp();

// A complete, valid job body - each bad-input test changes exactly one field of it,
// so a failure can only be caused by the rule under test.
const validJob = () => ({
  title: 'Backend Developer',
  mustHaveSkills: ['node', 'sql'],
  goodToHaveSkills: ['docker'],
  requiredExperienceYears: 3,
  matchingMode: 'strict',
  cutoffPercentage: 70,
});

const post = (body) => request(app).post('/api/jobs').send(body);

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.query('DELETE FROM evaluations');
  await db.query('DELETE FROM jobs');
});

/* ================================================================== */
describe('Phase 2 - POST /api/jobs (the happy path)', () => {
  test('a valid job is created -> 201 with the job and its new id', async () => {
    const res = await post(validJob());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      title: 'Backend Developer',
      mustHaveSkills: ['node', 'sql'],
      goodToHaveSkills: ['docker'],
      requiredExperienceYears: 3,
      matchingMode: 'strict',
      cutoffPercentage: 70,
    });
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('the skill bags come back as real arrays, not JSON text', async () => {
    const res = await post(validJob());
    expect(Array.isArray(res.body.mustHaveSkills)).toBe(true);
    expect(Array.isArray(res.body.goodToHaveSkills)).toBe(true);
  });

  test('the optional fields default correctly when omitted', async () => {
    const res = await post({
      title: 'Intern',
      mustHaveSkills: ['html'],
      matchingMode: 'soft',
      cutoffPercentage: 40,
    });

    expect(res.status).toBe(201);
    expect(res.body.goodToHaveSkills).toEqual([]);
    expect(res.body.requiredExperienceYears).toBe(0);
  });

  test('soft mode is accepted as well as strict', async () => {
    const res = await post({ ...validJob(), matchingMode: 'soft' });
    expect(res.status).toBe(201);
    expect(res.body.matchingMode).toBe('soft');
  });

  test('decimal experience is kept exactly (1.5 years)', async () => {
    const res = await post({ ...validJob(), requiredExperienceYears: 1.5 });
    expect(res.status).toBe(201);
    expect(res.body.requiredExperienceYears).toBe(1.5);
  });

  test('digits inside a title are fine - we ban the wrong type, not digits', async () => {
    const res = await post({ ...validJob(), title: 'Backend Developer 2026' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Backend Developer 2026');
  });

  test('surrounding whitespace is trimmed from the title and the skills', async () => {
    const res = await post({
      ...validJob(),
      title: '  Backend Developer  ',
      mustHaveSkills: ['  node  ', 'sql'],
    });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Backend Developer');
    expect(res.body.mustHaveSkills).toEqual(['node', 'sql']);
  });

  test('the cutoff boundaries 0 and 100 are both allowed', async () => {
    expect((await post({ ...validJob(), cutoffPercentage: 0 })).status).toBe(201);
    expect((await post({ ...validJob(), cutoffPercentage: 100 })).status).toBe(201);
  });

  test('the job is really persisted - it can be read back afterwards', async () => {
    const created = await post(validJob());
    const fetched = await request(app).get(`/api/jobs/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  test('unknown extra fields are ignored, never stored', async () => {
    const res = await post({ ...validJob(), isAdmin: true, sneaky: 'value' });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('isAdmin');
    expect(res.body).not.toHaveProperty('sneaky');
  });
});

/* ================================================================== */
describe('Phase 2 - POST /api/jobs (every validator rule -> 400)', () => {
  test('no body at all', async () => {
    const res = await request(app).post('/api/jobs').send();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
  });

  test('title missing', async () => {
    const body = validJob();
    delete body.title;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('title');
  });

  test('title is a number, not a string', async () => {
    const res = await post({ ...validJob(), title: 123 });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'title', message: /string/ });
  });

  test('title is blank / only whitespace', async () => {
    const res = await post({ ...validJob(), title: '    ' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('title');
  });

  test('mustHaveSkills missing', async () => {
    const body = validJob();
    delete body.mustHaveSkills;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('mustHaveSkills');
  });

  test('mustHaveSkills is an empty list (a job with no requirements)', async () => {
    const res = await post({ ...validJob(), mustHaveSkills: [] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/at least one must-have skill/);
  });

  test('mustHaveSkills is a string instead of a list', async () => {
    const res = await post({ ...validJob(), mustHaveSkills: 'node' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('mustHaveSkills');
  });

  test('mustHaveSkills contains a number', async () => {
    const res = await post({ ...validJob(), mustHaveSkills: ['node', 42] });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'mustHaveSkills.1', message: /string/ });
  });

  test('mustHaveSkills contains a blank string', async () => {
    const res = await post({ ...validJob(), mustHaveSkills: ['node', '   '] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('mustHaveSkills.1');
  });

  test('goodToHaveSkills is not a list', async () => {
    const res = await post({ ...validJob(), goodToHaveSkills: 'docker' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('goodToHaveSkills');
  });

  test('goodToHaveSkills contains a non-string', async () => {
    const res = await post({ ...validJob(), goodToHaveSkills: [null] });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('goodToHaveSkills.0');
  });

  test('requiredExperienceYears is a string', async () => {
    const res = await post({ ...validJob(), requiredExperienceYears: '3' });
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({
      field: 'requiredExperienceYears',
      message: /number/,
    });
  });

  test('requiredExperienceYears is negative', async () => {
    const res = await post({ ...validJob(), requiredExperienceYears: -1 });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/cannot be negative/);
  });

  test('matchingMode missing', async () => {
    const body = validJob();
    delete body.matchingMode;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('matchingMode');
  });

  test('matchingMode is neither strict nor soft', async () => {
    const res = await post({ ...validJob(), matchingMode: 'maybe' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/strict.*soft/);
  });

  test('cutoffPercentage missing', async () => {
    const body = validJob();
    delete body.cutoffPercentage;
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field)).toContain('cutoffPercentage');
  });

  test('cutoffPercentage is a string', async () => {
    const res = await post({ ...validJob(), cutoffPercentage: '70' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/number/);
  });

  test('cutoffPercentage is below 0', async () => {
    const res = await post({ ...validJob(), cutoffPercentage: -1 });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/between 0 and 100/);
  });

  test('cutoffPercentage is above 100', async () => {
    const res = await post({ ...validJob(), cutoffPercentage: 101 });
    expect(res.status).toBe(400);
    expect(res.body.details[0].message).toMatch(/between 0 and 100/);
  });

  test('the error body has a consistent, frontend-friendly shape', async () => {
    const res = await post({ ...validJob(), title: 123 });
    expect(res.body).toEqual({
      error: 'bad_request',
      message: 'Validation failed',
      details: [{ field: 'title', message: expect.any(String) }],
    });
  });

  test('several problems are reported together, not one at a time', async () => {
    const res = await post({
      title: '',
      mustHaveSkills: [],
      matchingMode: 'nope',
      cutoffPercentage: 500,
    });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining(['title', 'mustHaveSkills', 'matchingMode', 'cutoffPercentage'])
    );
  });

  test('a rejected request writes nothing to the database', async () => {
    await post({ ...validJob(), matchingMode: 'maybe' });
    const list = await request(app).get('/api/jobs');
    expect(list.body).toEqual([]);
  });
});

/* ================================================================== */
describe('Phase 2 - GET /api/jobs (list)', () => {
  test('an empty database returns 200 and an empty list, not a 404', async () => {
    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('every created job is listed', async () => {
    await post({ ...validJob(), title: 'One' });
    await post({ ...validJob(), title: 'Two' });
    await post({ ...validJob(), title: 'Three' });

    const res = await request(app).get('/api/jobs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((j) => j.title).sort()).toEqual(['One', 'Three', 'Two']);
  });

  test('the newest job comes first (HR dashboard order)', async () => {
    await post({ ...validJob(), title: 'Oldest' });
    await post({ ...validJob(), title: 'Middle' });
    await post({ ...validJob(), title: 'Newest' });

    const res = await request(app).get('/api/jobs');
    expect(res.body[0].title).toBe('Newest');
    expect(res.body[2].title).toBe('Oldest');
  });

  test('listed jobs carry parsed skill arrays too', async () => {
    await post(validJob());
    const res = await request(app).get('/api/jobs');
    expect(res.body[0].mustHaveSkills).toEqual(['node', 'sql']);
    expect(res.body[0].goodToHaveSkills).toEqual(['docker']);
  });
});

/* ================================================================== */
describe('Phase 2 - GET /api/jobs/:jobId (get one)', () => {
  test('an existing job is returned in full', async () => {
    const created = await post(validJob());
    const res = await request(app).get(`/api/jobs/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.title).toBe('Backend Developer');
    expect(res.body.mustHaveSkills).toEqual(['node', 'sql']);
  });

  test('the right job is returned when several exist', async () => {
    const a = await post({ ...validJob(), title: 'Job A' });
    const b = await post({ ...validJob(), title: 'Job B' });

    expect((await request(app).get(`/api/jobs/${a.body.id}`)).body.title).toBe('Job A');
    expect((await request(app).get(`/api/jobs/${b.body.id}`)).body.title).toBe('Job B');
  });

  test('an id that does not exist -> 404', async () => {
    const res = await request(app).get('/api/jobs/999999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
    expect(res.body.message).toMatch(/999999/);
  });

  // Shape is the guard's job; existence is the service's. These must not be confused.
  test('a non-numeric id -> 400 from the guard, not 404', async () => {
    const res = await request(app).get('/api/jobs/abc');
    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({
      field: 'jobId',
      message: 'jobId must be a positive integer',
    });
  });

  test('id 0 and a negative id are both rejected as bad shape', async () => {
    expect((await request(app).get('/api/jobs/0')).status).toBe(400);
    expect((await request(app).get('/api/jobs/-5')).status).toBe(400);
  });

  test('a decimal id is rejected as bad shape', async () => {
    expect((await request(app).get('/api/jobs/1.5')).status).toBe(400);
  });

  test('a well-formed id that simply has no row -> 404', async () => {
    const created = await post(validJob());
    const res = await request(app).get(`/api/jobs/${created.body.id + 1000}`);
    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
describe('Phase 2 - the layers underneath', () => {
  test('the repository returns null for a missing job (it does not throw)', async () => {
    await expect(jobRepository.getJobById(999999)).resolves.toBe(null);
  });

  test('the service turns that null into a NotFoundError (which becomes the 404)', async () => {
    await expect(jobService.getJob(999999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(jobService.getJob(999999)).rejects.toMatchObject({ status: 404 });
  });

  test('the repository round-trips a job unchanged', async () => {
    const created = await jobRepository.createJob({
      title: 'Repo Test',
      mustHaveSkills: ['go'],
      goodToHaveSkills: [],
      requiredExperienceYears: 2.5,
      matchingMode: 'soft',
      cutoffPercentage: 55,
    });
    await expect(jobRepository.getJobById(created.id)).resolves.toEqual(created);
  });

  test('an unknown /api path still returns the standard 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
