// Phase 4 test round - the read doors: one result, and every result for a job.
//
// Nothing is mocked here, and nothing needs to be. Phase 4 adds no LLM call and no
// network hop: it is two SELECTs, a JOIN and three filters. So these tests drive the
// real Express app against the real database and seed their data through the real
// repositories - the same functions the pipeline itself writes with.
//
// The one thing worth stating up front is WHAT is being seeded. HR's screen shows a
// job in every state at once: candidates who passed, near-misses who did not,
// somebody still processing, and somebody whose resume could not be read. The cast
// below is built to hold all four, because a list door that only works when every
// row is complete is a list door that breaks on the first real Tuesday.

const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/config/db');
const { runMigrations } = require('../src/config/migrator');

const jobRepository = require('../src/repositories/jobRepository');
const resumeRepository = require('../src/repositories/resumeRepository');
const evaluationRepository = require('../src/repositories/evaluationRepository');
const evaluationService = require('../src/services/evaluationService');
const { NotFoundError } = require('../src/utils/errors');
const { sampleJob } = require('./helpers/fixtures');

const app = createApp();

const CALLBACK_URL = 'https://ats.example.com/hooks/evaluations';

/* ============================ seeding ============================ */

/** A job, straight through the repository - Phase 2 already proved the door works. */
async function createJob(overrides = {}) {
  const { id, createdAt, ...data } = sampleJob(overrides);
  return jobRepository.createJob(data);
}

/**
 * One evaluation in whatever state the test needs.
 *
 * It is built the way the pipeline builds it - create the row empty, then update it
 * - rather than by an INSERT the app would never issue. So if the write path and
 * the read path ever disagree about a column, these tests are where it shows.
 */
async function seedEvaluation(jobId, { candidate, result } = {}) {
  const evaluation = await evaluationRepository.createEvaluation({
    jobId,
    callbackUrl: CALLBACK_URL,
  });

  if (candidate) {
    const resume = await resumeRepository.createResume({
      name: 'Candidate',
      phone: '+91 90000 00000',
      email: 'candidate@example.com',
      filePath: 'data/uploads/generated-name.pdf',
      extractedText: 'Built REST APIs with Express and Postgres.',
      listedSkills: ['Node.js', 'SQL'],
      usedSkills: ['Express'],
      totalExperienceYears: 4,
      ...candidate,
    });
    await evaluationRepository.updateEvaluation(evaluation.id, { resumeId: resume.id });
  }

  if (result) {
    await evaluationRepository.updateEvaluation(evaluation.id, result);
  }

  return evaluation.id;
}

/** A completed result, with the fields a test cares about overridden. */
const completed = (overrides = {}) => ({
  status: 'completed',
  eligible: true,
  overallPercentage: 92,
  matchedRequiredSkills: ['Node.js', 'SQL'],
  missingSkills: [],
  extraSkills: ['React', 'Docker'],
  requiredExperienceYears: 3,
  candidateExperienceYears: 6,
  ...overrides,
});

/**
 * The cast for the list and filter tests - one job, six candidates, every state HR
 * can actually be looking at:
 *
 *   Asha    eligible, 92%, 6 yrs     - the strong hire
 *   Bikram  eligible, 75%, 3 yrs     - scrapes in
 *   Chitra  NOT eligible, 71%, 4 yrs - the NEAR-MISS doc 06 insists we keep
 *   Deepak  NOT eligible, 45%, 1 yr  - a clear no
 *   Esha    still processing         - no result, no candidate yet
 *   Farid   failed, unreadable       - no candidate either
 */
async function seedCast(jobId) {
  const ids = {};
  ids.asha = await seedEvaluation(jobId, {
    candidate: { name: 'Asha Rao', email: 'asha@example.com', totalExperienceYears: 6 },
    result: completed(),
  });
  ids.bikram = await seedEvaluation(jobId, {
    candidate: { name: 'Bikram Sen', email: 'bikram@example.com', totalExperienceYears: 3 },
    result: completed({ overallPercentage: 75, candidateExperienceYears: 3 }),
  });
  ids.chitra = await seedEvaluation(jobId, {
    candidate: { name: 'Chitra Iyer', email: 'chitra@example.com', totalExperienceYears: 4 },
    result: completed({
      eligible: false,
      overallPercentage: 71,
      candidateExperienceYears: 4,
      matchedRequiredSkills: ['Node.js'],
      missingSkills: ['SQL'],
    }),
  });
  ids.deepak = await seedEvaluation(jobId, {
    candidate: { name: 'Deepak Nair', email: 'deepak@example.com', totalExperienceYears: 1 },
    result: completed({
      eligible: false,
      overallPercentage: 45,
      candidateExperienceYears: 1,
      matchedRequiredSkills: [],
      missingSkills: ['Node.js', 'SQL'],
    }),
  });
  ids.esha = await seedEvaluation(jobId);
  ids.farid = await seedEvaluation(jobId, {
    result: { status: 'failed', failureReason: 'unreadable_resume' },
  });
  return ids;
}

/* ============================ small helpers ============================ */

const getDetail = (id) => request(app).get(`/api/evaluations/${id}`);
const getList = (jobId, query = '') => request(app).get(`/api/jobs/${jobId}/evaluations${query}`);

/** The candidate names a list response came back with, in the order they arrived. */
const names = (res) => res.body.map((e) => (e.candidate ? e.candidate.name : null));

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.query('DELETE FROM evaluations');
  await db.query('DELETE FROM resumes');
  await db.query('DELETE FROM jobs');
});

/* ================================================================== */
describe('Phase 4 - GET /api/evaluations/:id (the detail door)', () => {
  test('a completed evaluation comes back whole - every result column filled', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, { candidate: {}, result: completed() });

    const res = await getDetail(id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      jobId: job.id,
      status: 'completed',
      failureReason: null,
      eligible: true,
      overallPercentage: 92,
      matchedRequiredSkills: ['Node.js', 'SQL'],
      missingSkills: [],
      extraSkills: ['React', 'Docker'],
      requiredExperienceYears: 3,
      candidateExperienceYears: 6,
    });
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('the skill bags are real arrays and eligible is a real boolean, not 1/0', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, { candidate: {}, result: completed() });

    const { body } = await getDetail(id);

    expect(Array.isArray(body.matchedRequiredSkills)).toBe(true);
    expect(Array.isArray(body.missingSkills)).toBe(true);
    expect(Array.isArray(body.extraSkills)).toBe(true);
    expect(body.eligible).toBe(true);
    expect(typeof body.eligible).toBe('boolean');
  });

  test('an ineligible candidate is eligible:false, not a missing field', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, {
      candidate: {},
      result: completed({ eligible: false, overallPercentage: 71 }),
    });

    const { body } = await getDetail(id);
    expect(body.eligible).toBe(false);
    expect(body.overallPercentage).toBe(71);
  });

  test('THE NEAR-MISS: a rejected candidate still shows the percentage they scored', async () => {
    const job = await createJob({ cutoffPercentage: 75 });
    const id = await seedEvaluation(job.id, {
      candidate: { name: 'Chitra Iyer' },
      result: completed({
        eligible: false,
        overallPercentage: 71,
        matchedRequiredSkills: ['Node.js'],
        missingSkills: ['SQL'],
      }),
    });

    const { body } = await getDetail(id);

    // "rejected, but 71%" - the whole reason doc 06 stores the number either way.
    expect(body.eligible).toBe(false);
    expect(body.overallPercentage).toBe(71);
    expect(body.missingSkills).toEqual(['SQL']);
    expect(body.candidate.name).toBe('Chitra Iyer');
  });

  test('a still-processing evaluation is a 200, not a 404 - the result is simply not in yet', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id);

    const res = await getDetail(id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'processing',
      eligible: null,
      overallPercentage: null,
      matchedRequiredSkills: null,
      candidate: null,
    });
  });

  test('a failed evaluation carries its failure_reason instead of a result', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, {
      result: { status: 'failed', failureReason: 'unreadable_resume' },
    });

    const { body } = await getDetail(id);

    expect(body.status).toBe('failed');
    expect(body.failureReason).toBe('unreadable_resume');
    expect(body.overallPercentage).toBe(null);
  });

  test('a failure AFTER extraction still shows the candidate - HR gets a name, not a blank row', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, {
      candidate: { name: 'Asha Rao', phone: '+91 90000 00000' },
      result: { status: 'failed', failureReason: 'llm_overloaded' },
    });

    const { body } = await getDetail(id);

    expect(body.status).toBe('failed');
    expect(body.failureReason).toBe('llm_overloaded');
    expect(body.candidate).toMatchObject({ name: 'Asha Rao', phone: '+91 90000 00000' });
  });

  test('the webhook fields are readable too - this door is the delivery backup', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, {
      candidate: {},
      result: completed({ deliveryStatus: 'failed' }),
    });

    const { body } = await getDetail(id);

    // Delivery failed, the result did not. That is exactly the case doc 06 keeps
    // this door open for: the caller pulls what the webhook could not push.
    expect(body.deliveryStatus).toBe('failed');
    expect(body.callbackUrl).toBe(CALLBACK_URL);
    expect(body.status).toBe('completed');
  });

  test('an unknown id -> 404, in the same error shape as every other door', async () => {
    const res = await getDetail(999999);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
    expect(typeof res.body.message).toBe('string');
  });

  test('a malformed id is 400 from the guard, not 404 - shape before existence', async () => {
    const res = await getDetail('abc');

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'bad_request' });
    expect(res.body.details[0]).toMatchObject({ field: 'id' });
  });

  test('id 0 and a negative id are rejected by shape as well', async () => {
    expect((await getDetail(0)).status).toBe(400);
    expect((await getDetail(-3)).status).toBe(400);
  });

  test('reading one evaluation is exactly ONE query - the JOIN, not a second trip', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, { candidate: {}, result: completed() });

    const spy = jest.spyOn(db, 'query');
    await getDetail(id);
    const statements = spy.mock.calls.map(([sql]) => sql);
    spy.mockRestore();

    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/JOIN\s+resumes/i);
  });
});

/* ================================================================== */
describe('Phase 4 - the JOIN: the candidate travels with the result', () => {
  test('the candidate comes back nested inside the evaluation', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, {
      candidate: {
        name: 'Asha Rao',
        phone: '+91 90000 00000',
        email: 'asha@example.com',
        listedSkills: ['Node.js', 'SQL', 'React'],
        usedSkills: ['Express', 'Postgres'],
        totalExperienceYears: 6,
      },
      result: completed(),
    });

    const { body } = await getDetail(id);

    expect(body.candidate).toMatchObject({
      name: 'Asha Rao',
      phone: '+91 90000 00000',
      email: 'asha@example.com',
      listedSkills: ['Node.js', 'SQL', 'React'],
      usedSkills: ['Express', 'Postgres'],
      totalExperienceYears: 6,
    });
    expect(body.candidate.resumeId).toBe(body.resumeId);
    expect(body.candidate.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("the candidate's skill bags are arrays, not the JSON text the column holds", async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, {
      candidate: { listedSkills: ['Node.js'], usedSkills: [] },
      result: completed(),
    });

    const { body } = await getDetail(id);
    expect(Array.isArray(body.candidate.listedSkills)).toBe(true);
    expect(body.candidate.usedSkills).toEqual([]);
  });

  test('an absent name / phone / email stays null - the resume simply did not have one', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, {
      candidate: { name: null, phone: null, email: null },
      result: completed(),
    });

    const { body } = await getDetail(id);
    expect(body.candidate).toMatchObject({ name: null, phone: null, email: null });
  });

  test('the resume text and the file path are NOT exposed', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, { candidate: {}, result: completed() });

    const { body } = await getDetail(id);

    // The whole resume would bloat every row, and the disk path is our business,
    // not the caller's. Neither belongs in an API response.
    expect(body.candidate).not.toHaveProperty('extractedText');
    expect(body.candidate).not.toHaveProperty('filePath');
    expect(JSON.stringify(body)).not.toContain('data/uploads');
  });

  test('the JOIN is a LEFT join - an evaluation with no resume yet is still returned', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id);

    // An inner join would hide exactly the row the caller polls for after their 202.
    const evaluation = await evaluationRepository.getEvaluationById(id);
    expect(evaluation).not.toBe(null);
    expect(evaluation.resumeId).toBe(null);
    expect(evaluation.candidate).toBe(null);
  });

  test("two candidates never get each other's details", async () => {
    const job = await createJob();
    const first = await seedEvaluation(job.id, {
      candidate: { name: 'Asha Rao', email: 'asha@example.com' },
      result: completed(),
    });
    const second = await seedEvaluation(job.id, {
      candidate: { name: 'Bikram Sen', email: 'bikram@example.com' },
      result: completed({ overallPercentage: 75 }),
    });

    expect((await getDetail(first)).body.candidate.name).toBe('Asha Rao');
    expect((await getDetail(second)).body.candidate.name).toBe('Bikram Sen');
  });
});

/* ================================================================== */
describe('Phase 4 - GET /api/jobs/:jobId/evaluations (the list door)', () => {
  test('with no filters, EVERY candidate for the job comes back - near-misses included', async () => {
    const job = await createJob();
    await seedCast(job.id);

    const res = await getList(job.id);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
    // The near-miss is in the default view. That is the point: HR decides, not the gate.
    expect(names(res)).toContain('Chitra Iyer');
  });

  test('processing and failed rows are listed too, with their state on show', async () => {
    const job = await createJob();
    await seedCast(job.id);

    const { body } = await getList(job.id);
    const byStatus = body.reduce(
      (acc, e) => ({ ...acc, [e.status]: (acc[e.status] || 0) + 1 }),
      {}
    );

    expect(byStatus).toEqual({ completed: 4, processing: 1, failed: 1 });
    expect(body.find((e) => e.status === 'failed').failureReason).toBe('unreadable_resume');
    expect(body.find((e) => e.status === 'processing').candidate).toBe(null);
  });

  test('every row carries its own candidate, from the same single query', async () => {
    const job = await createJob();
    await seedCast(job.id);

    const spy = jest.spyOn(db, 'query');
    const { body } = await getList(job.id);
    const statements = spy.mock.calls.map(([sql]) => sql);
    spy.mockRestore();

    // Two statements: the job existence check, then ONE select for all six rows.
    // Not one-per-candidate - that is the N+1 the JOIN exists to avoid.
    expect(statements).toHaveLength(2);
    expect(statements.filter((s) => /FROM evaluations/i.test(s))).toHaveLength(1);
    expect(
      body
        .filter((e) => e.candidate)
        .map((e) => e.candidate.name)
        .sort()
    ).toEqual(['Asha Rao', 'Bikram Sen', 'Chitra Iyer', 'Deepak Nair']);
  });

  test('the list is ranked - highest percentage first, the not-yet-scored last', async () => {
    const job = await createJob();
    await seedCast(job.id);

    const { body } = await getList(job.id);

    expect(body.slice(0, 4).map((e) => e.overallPercentage)).toEqual([92, 75, 71, 45]);
    expect(body.slice(4).every((e) => e.overallPercentage === null)).toBe(true);
  });

  test("only THIS job's candidates are listed", async () => {
    const jobA = await createJob({ title: 'Backend Developer' });
    const jobB = await createJob({ title: 'Frontend Developer' });
    await seedEvaluation(jobA.id, { candidate: { name: 'Asha Rao' }, result: completed() });
    await seedEvaluation(jobB.id, { candidate: { name: 'Bikram Sen' }, result: completed() });

    expect(names(await getList(jobA.id))).toEqual(['Asha Rao']);
    expect(names(await getList(jobB.id))).toEqual(['Bikram Sen']);
  });

  test('a real job with nobody in it is an empty list and a 200 - not a 404', async () => {
    const job = await createJob();

    const res = await getList(job.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('an unknown job -> 404: "no candidates" and "no such job" are different answers', async () => {
    const res = await getList(999999);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'not_found' });
  });

  test('a malformed :jobId is 400 from the guard, not 404', async () => {
    const res = await getList('abc');

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'jobId' });
  });

  test('a list row is the same shape as the detail row - one contract, not two', async () => {
    const job = await createJob();
    const id = await seedEvaluation(job.id, { candidate: {}, result: completed() });

    const detail = await getDetail(id);
    const list = await getList(job.id);

    expect(list.body[0]).toEqual(detail.body);
  });
});

/* ================================================================== */
describe('Phase 4 - the filters, one at a time', () => {
  let job;
  beforeEach(async () => {
    job = await createJob();
    await seedCast(job.id);
  });

  test('eligible=true keeps only the candidates who passed both gates', async () => {
    const res = await getList(job.id, '?eligible=true');

    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Asha Rao', 'Bikram Sen']);
    expect(res.body.every((e) => e.eligible === true)).toBe(true);
  });

  test('eligible=false keeps only the ones a gate eliminated', async () => {
    const res = await getList(job.id, '?eligible=false');

    expect(names(res)).toEqual(['Chitra Iyer', 'Deepak Nair']);
    expect(res.body.every((e) => e.eligible === false)).toBe(true);
  });

  test('an unfinished evaluation is neither eligible nor ineligible - it is unknown', async () => {
    const yes = await getList(job.id, '?eligible=true');
    const no = await getList(job.id, '?eligible=false');

    // processing and failed rows have eligible = NULL, so they answer neither filter.
    // The unfiltered list is 6; the two filtered halves come to 4.
    expect(yes.body.length + no.body.length).toBe(4);
    expect([...yes.body, ...no.body].some((e) => e.status !== 'completed')).toBe(false);
  });

  test('minPercentage narrows to the candidates at or above that score', async () => {
    const res = await getList(job.id, '?minPercentage=72');

    expect(names(res)).toEqual(['Asha Rao', 'Bikram Sen']);
  });

  test('minPercentage is >=, not > - landing exactly on the number keeps you in', async () => {
    const res = await getList(job.id, '?minPercentage=71');

    expect(names(res)).toEqual(['Asha Rao', 'Bikram Sen', 'Chitra Iyer']);
  });

  test('minPercentage=0 keeps every SCORED candidate, and only those', async () => {
    const res = await getList(job.id, '?minPercentage=0');

    // The processing and failed rows have no percentage, so a numeric filter cannot
    // include them: "at least 0%" is still a question we cannot answer for them yet.
    expect(res.body).toHaveLength(4);
  });

  test('a minPercentage nobody reaches gives an empty list, not an error', async () => {
    const res = await getList(job.id, '?minPercentage=99');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('minExperience narrows on the snapshotted candidate years', async () => {
    const res = await getList(job.id, '?minExperience=4');

    expect(names(res)).toEqual(['Asha Rao', 'Chitra Iyer']);
  });

  test('minExperience is >= too - exactly 3 years passes a 3-year filter', async () => {
    const res = await getList(job.id, '?minExperience=3');

    expect(names(res)).toEqual(['Asha Rao', 'Bikram Sen', 'Chitra Iyer']);
  });

  test('a decimal minExperience is honoured, not rounded', async () => {
    const res = await getList(job.id, '?minExperience=3.5');

    expect(names(res)).toEqual(['Asha Rao', 'Chitra Iyer']);
  });

  test('each filter only ever NARROWS - it can never add a row', async () => {
    const all = await getList(job.id);
    const ids = new Set(all.body.map((e) => e.id));

    for (const filter of ['?eligible=true', '?minPercentage=50', '?minExperience=2']) {
      const res = await getList(job.id, filter);
      expect(res.body.length).toBeLessThanOrEqual(all.body.length);
      expect(res.body.every((e) => ids.has(e.id))).toBe(true);
    }
  });

  test('a filtered list keeps its ranking and its candidates', async () => {
    const res = await getList(job.id, '?minPercentage=50');

    expect(res.body.map((e) => e.overallPercentage)).toEqual([92, 75, 71]);
    expect(res.body.every((e) => e.candidate !== null)).toBe(true);
  });
});

/* ================================================================== */
describe('Phase 4 - the filters combined', () => {
  let job;
  beforeEach(async () => {
    job = await createJob();
    await seedCast(job.id);
  });

  test('eligible + minPercentage narrows on BOTH, not on whichever came last', async () => {
    const res = await getList(job.id, '?eligible=true&minPercentage=80');

    expect(names(res)).toEqual(['Asha Rao']);
  });

  test('all three at once', async () => {
    const res = await getList(job.id, '?eligible=true&minPercentage=70&minExperience=5');

    expect(names(res)).toEqual(['Asha Rao']);
  });

  test('the order of the query parameters makes no difference', async () => {
    const first = await getList(job.id, '?eligible=true&minPercentage=70');
    const second = await getList(job.id, '?minPercentage=70&eligible=true');

    expect(second.body).toEqual(first.body);
  });

  test('combined filters are an AND - a row must satisfy every one of them', async () => {
    // Chitra clears the experience bar but is not eligible; Bikram is eligible but
    // is short of the experience bar. Neither satisfies both, so neither survives.
    const res = await getList(job.id, '?eligible=true&minExperience=4');

    expect(names(res)).toEqual(['Asha Rao']);
  });

  test('a combination nobody satisfies is an empty list', async () => {
    const res = await getList(job.id, '?eligible=true&minPercentage=95');

    expect(res.body).toEqual([]);
  });

  test('the same filters applied to another job stay scoped to the job in the URL', async () => {
    const other = await createJob({ title: 'Frontend Developer' });
    await seedEvaluation(other.id, {
      candidate: { name: 'Esha Kapoor', totalExperienceYears: 9 },
      result: completed({ overallPercentage: 99, candidateExperienceYears: 9 }),
    });

    // Esha would satisfy these filters - but she applied to the other job.
    expect((await getList(job.id, '?eligible=true&minPercentage=95')).body).toEqual([]);
    expect(names(await getList(other.id, '?eligible=true&minPercentage=95'))).toEqual([
      'Esha Kapoor',
    ]);
  });
});

/* ================================================================== */
describe('Phase 4 - the filter guard, rule by rule (doc 04)', () => {
  let job;
  beforeEach(async () => {
    job = await createJob();
    await seedCast(job.id);
  });

  const expectRejected = (res, field) => {
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'bad_request' });
    expect(res.body.details.some((d) => d.field === field)).toBe(true);
  };

  test('eligible=maybe -> 400', async () => {
    expectRejected(await getList(job.id, '?eligible=maybe'), 'eligible');
  });

  test('eligible=1 -> 400: a URL can carry an unambiguous word, so we insist on one', async () => {
    expectRejected(await getList(job.id, '?eligible=1'), 'eligible');
  });

  test('an empty eligible -> 400', async () => {
    expectRejected(await getList(job.id, '?eligible='), 'eligible');
  });

  test('TRUE and True are accepted - the case of a word is not a rule', async () => {
    expect((await getList(job.id, '?eligible=TRUE')).status).toBe(200);
    expect((await getList(job.id, '?eligible=True')).body).toHaveLength(2);
  });

  test('minPercentage that is not a number -> 400', async () => {
    expectRejected(await getList(job.id, '?minPercentage=abc'), 'minPercentage');
  });

  test('an empty minPercentage -> 400, not a silent filter of zero', async () => {
    expectRejected(await getList(job.id, '?minPercentage='), 'minPercentage');
  });

  test('minPercentage below 0 or above 100 -> 400', async () => {
    expectRejected(await getList(job.id, '?minPercentage=-1'), 'minPercentage');
    expectRejected(await getList(job.id, '?minPercentage=101'), 'minPercentage');
  });

  test('the 0 and 100 boundaries are both allowed', async () => {
    expect((await getList(job.id, '?minPercentage=0')).status).toBe(200);
    expect((await getList(job.id, '?minPercentage=100')).status).toBe(200);
  });

  test('a negative minExperience -> 400', async () => {
    expectRejected(await getList(job.id, '?minExperience=-1'), 'minExperience');
  });

  test('minExperience that is not a number -> 400', async () => {
    expectRejected(await getList(job.id, '?minExperience=two+years'), 'minExperience');
  });

  test('a filter repeated twice is an array, not a number -> 400', async () => {
    expectRejected(await getList(job.id, '?minPercentage=10&minPercentage=90'), 'minPercentage');
  });

  test('SQL in a filter never reaches the database - it is rejected as not a number', async () => {
    const res = await getList(job.id, '?minPercentage=0;%20DROP%20TABLE%20evaluations');

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT COUNT(*) AS n FROM evaluations');
    expect(rows[0].n).toBe(6);
  });

  test('unknown query parameters are ignored, never turned into a filter', async () => {
    const res = await getList(job.id, '?sortBy=salary&limit=1&sneaky=1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
  });

  test('a rejected filter is refused before any query runs', async () => {
    const spy = jest.spyOn(db, 'query');
    await getList(job.id, '?eligible=maybe');
    const calls = spy.mock.calls.length;
    spy.mockRestore();

    expect(calls).toBe(0);
  });

  test('every bad filter is reported, not just the first one', async () => {
    const res = await getList(job.id, '?eligible=maybe&minPercentage=abc');

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field).sort()).toEqual(['eligible', 'minPercentage']);
  });
});

/* ================================================================== */
describe('Phase 4 - the layers underneath', () => {
  test("getEvaluationById returns null for an unknown id - the 404 is the service's call", async () => {
    await expect(evaluationRepository.getEvaluationById(999999)).resolves.toBe(null);
  });

  test('the service turns that null into NotFound', async () => {
    await expect(evaluationService.getById(999999)).rejects.toThrow(NotFoundError);
  });

  test('listByJob refuses an unknown job rather than returning an empty list', async () => {
    await expect(evaluationService.listByJob(999999)).rejects.toThrow(NotFoundError);
  });

  test('listByJob with no filters returns everything for the job', async () => {
    const job = await createJob();
    await seedCast(job.id);

    await expect(evaluationService.listByJob(job.id)).resolves.toHaveLength(6);
  });

  test('the repository takes filters as values, and undefined adds no clause', async () => {
    const job = await createJob();
    await seedCast(job.id);

    const all = await evaluationRepository.listEvaluationsByJob(job.id, {
      eligible: undefined,
      minPercentage: undefined,
      minExperience: undefined,
    });
    const narrowed = await evaluationRepository.listEvaluationsByJob(job.id, {
      eligible: true,
      minPercentage: 80,
    });

    expect(all).toHaveLength(6);
    expect(narrowed.map((e) => e.candidate.name)).toEqual(['Asha Rao']);
  });

  test('eligible=false is a filter, not an absent one - a falsy value still counts', async () => {
    const job = await createJob();
    await seedCast(job.id);

    const rows = await evaluationRepository.listEvaluationsByJob(job.id, { eligible: false });

    expect(rows.map((e) => e.candidate.name)).toEqual(['Chitra Iyer', 'Deepak Nair']);
  });

  test('minPercentage 0 is a filter too, not a missing one', async () => {
    const job = await createJob();
    await seedCast(job.id);

    // The classic falsy-value bug: `if (filters.minPercentage)` would drop this
    // clause and silently return the unscored rows as well.
    const rows = await evaluationRepository.listEvaluationsByJob(job.id, { minPercentage: 0 });

    expect(rows).toHaveLength(4);
  });

  test('toEvaluationWithCandidate maps a joined row, and null when there is no resume', async () => {
    const withCandidate = evaluationRepository.toEvaluationWithCandidate({
      id: 1,
      job_id: 2,
      resume_id: 3,
      status: 'completed',
      eligible: 1,
      matched_required_skills: '["Node.js"]',
      candidate_id: 3,
      candidate_name: 'Asha Rao',
      candidate_listed_skills: '["Node.js"]',
      candidate_used_skills: '[]',
    });
    const without = evaluationRepository.toEvaluationWithCandidate({
      id: 4,
      job_id: 2,
      resume_id: null,
      status: 'processing',
      candidate_id: null,
    });

    expect(withCandidate.candidate).toMatchObject({ resumeId: 3, name: 'Asha Rao' });
    expect(withCandidate.eligible).toBe(true);
    expect(without.candidate).toBe(null);
    expect(evaluationRepository.toEvaluationWithCandidate(undefined)).toBe(null);
  });

  test('a job with no evaluations lists as an empty array, not null', async () => {
    const job = await createJob();

    await expect(evaluationRepository.listEvaluationsByJob(job.id)).resolves.toEqual([]);
  });
});
