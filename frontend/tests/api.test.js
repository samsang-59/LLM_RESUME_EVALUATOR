// The API layer - the ONLY place that calls the backend (doc 10).
import { describe, expect, test, vi } from 'vitest';
import * as api from '../src/api';
import { ApiError, request, setUnauthorizedHandler, tokenStore } from '../src/api/client';
import { mockBackend, respond } from './helpers';

describe('Phase 6 - API layer: each function calls the right door', () => {
  test.each([
    ['getJobs', () => api.getJobs(), 'GET', '/api/jobs'],
    ['getJobById', () => api.getJobById(3), 'GET', '/api/jobs/3'],
    ['getJobCandidates', () => api.getJobCandidates(3), 'GET', '/api/jobs/3/evaluations'],
    ['getEvaluationById', () => api.getEvaluationById(9), 'GET', '/api/evaluations/9'],
  ])('%s -> %s %s', async (_name, call, method, path) => {
    const { calls } = mockBackend({ [`${method} ${path}`]: () => ({}) });
    await call();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method, path });
  });

  test('createJob POSTs the job as JSON', async () => {
    const { calls } = mockBackend({ 'POST /api/jobs': () => ({ id: 1 }) });
    const job = { title: 'X', mustHaveSkills: ['a'], goodToHaveSkills: [], requiredExperienceYears: 0, matchingMode: 'soft', cutoffPercentage: 50 };
    await api.createJob(job);
    expect(calls[0].body).toEqual(job);
    expect(calls[0].headers['Content-Type']).toBe('application/json');
  });

  test('login and register POST to the auth doors', async () => {
    const { calls } = mockBackend({
      'POST /api/auth/login': () => ({ token: 't', user: {} }),
      'POST /api/auth/register': () => ({ token: 't', user: {} }),
    });
    await api.login({ email: 'a@b.co', password: 'pw' });
    await api.register({ username: 'A', email: 'a@b.co', password: 'password1' });
    expect(calls.map((c) => c.path)).toEqual(['/api/auth/login', '/api/auth/register']);
    expect(calls[1].body).toEqual({ username: 'A', email: 'a@b.co', password: 'password1' });
  });

  test('there is no resume-submit function - that door belongs to the ATS (Model A)', () => {
    expect(Object.keys(api).some((name) => /submit|upload|resume/i.test(name))).toBe(false);
  });

  test('logout forgets the token (JWTs are stateless - nothing to call)', () => {
    const { fetchMock } = mockBackend({});
    tokenStore.set('abc');
    api.logout();
    expect(tokenStore.get()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Phase 6 - API layer: the JWT is attached', () => {
  test('a stored token goes out as Authorization: Bearer on HR doors', async () => {
    const { calls } = mockBackend({ 'GET /api/jobs': () => [] });
    tokenStore.set('my.jwt.token');
    await api.getJobs();
    expect(calls[0].headers.Authorization).toBe('Bearer my.jwt.token');
  });

  test('no token stored -> no Authorization header at all (not "Bearer null")', async () => {
    const { calls } = mockBackend({ 'GET /api/jobs': () => [] });
    await api.getJobs();
    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  test('the auth doors never send a token, even a stored one', async () => {
    const { calls } = mockBackend({ 'POST /api/auth/login': () => ({ token: 't', user: {} }) });
    tokenStore.set('old.token');
    await api.login({ email: 'a@b.co', password: 'pw' });
    expect(calls[0].headers.Authorization).toBeUndefined();
  });
});

describe('Phase 6 - API layer: filters become the query string', () => {
  const run = async (filters) => {
    const { calls } = mockBackend({ 'GET /api/jobs/1/evaluations': () => [] });
    await api.getJobCandidates(1, filters);
    return calls[0].query;
  };

  test('no filters -> no query at all (the default is everyone, near-misses included)', async () => {
    expect(await run()).toEqual({});
    expect(await run({ eligible: false, minPercentage: 0, minExperience: 0 })).toEqual({});
  });

  test('each filter maps to the backend parameter name', async () => {
    expect(await run({ eligible: true })).toEqual({ eligible: 'true' });
    expect(await run({ minPercentage: 60 })).toEqual({ minPercentage: '60' });
    expect(await run({ minExperience: 3 })).toEqual({ minExperience: '3' });
  });

  test('filters combine', async () => {
    expect(await run({ eligible: true, minPercentage: 70, minExperience: 5 })).toEqual({
      eligible: 'true',
      minPercentage: '70',
      minExperience: '5',
    });
  });
});

describe('Phase 6 - API layer: failures', () => {
  test('a non-2xx answer throws ApiError carrying status, code, message and details', async () => {
    const details = [{ field: 'title', message: 'title is required' }];
    mockBackend({ 'POST /api/jobs': () => respond(400, { error: 'bad_request', message: 'Validation failed', details }) });
    const err = await api.createJob({}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'bad_request', message: 'Validation failed', details });
  });

  test('a network failure becomes ApiError with status 0 and a readable message', async () => {
    mockBackend({ 'GET /api/jobs': () => new TypeError('Failed to fetch') });
    const err = await api.getJobs().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/could not reach the server/i);
  });

  test('a body that is not JSON still produces a usable ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('bad'); } })));
    const err = await request('/api/jobs').catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/502/);
  });

  test('401 on a guarded door triggers the unauthorized handler (session died)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockBackend({ 'GET /api/jobs': () => respond(401, { error: 'unauthorized', message: 'Token expired' }) });
    await api.getJobs().catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(() => {});
  });

  test('401 on the login door is just a wrong password - no logout triggered', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockBackend({ 'POST /api/auth/login': () => respond(401, { error: 'unauthorized', message: 'Invalid email or password' }) });
    await api.login({ email: 'a@b.co', password: 'x' }).catch(() => {});
    expect(handler).not.toHaveBeenCalled();
    setUnauthorizedHandler(() => {});
  });

  test('other errors (403, 404, 500) do not log the user out', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    for (const status of [403, 404, 500]) {
      mockBackend({ 'GET /api/jobs': () => respond(status, { message: 'x' }) });
      await api.getJobs().catch(() => {});
    }
    expect(handler).not.toHaveBeenCalled();
    setUnauthorizedHandler(() => {});
  });
});
