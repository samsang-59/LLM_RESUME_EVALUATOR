// Phase 7 test round - hardening (doc 11): the parked items, each checked on its own.
//
//   1. Webhook SSRF  - https only, no internal addresses, checked at submission AND
//                      at send time against the address the name really resolves to
//   2. Refresh tokens - a 15-minute access JWT plus a 7-day refresh token that is
//                      stored hashed, rotated on every use, and revoked by logout
//   3. Per-ATS keys  - company A gets key A, company B gets key B; HR issues and
//                      revokes them; the old shared .env key no longer opens anything
//
// The other two parked items - the token-storage review and the prompt-injection
// residual note - were decided as write-ups, not code, and live in the design docs
// (docs 10 and 06).
//
// As in Phase 3, the LLM is mocked at the OpenAI SDK and nothing else is. DNS is
// replaced only in the tests that need a hostname to "resolve" to a chosen address -
// that is the one input an attacker controls, and it cannot be staged for real.

const mockCreate = jest.fn();

jest.mock('openai', () => ({
  OpenAI: class {
    constructor() {
      this.chat = { completions: { create: mockCreate } };
    }
  },
}));

const crypto = require('crypto');
const dns = require('dns');
const fs = require('fs');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const db = require('../src/config/db');
const config = require('../src/config/env');
const { runMigrations } = require('../src/config/migrator');

const webhookService = require('../src/services/webhookService');
const evaluationService = require('../src/services/evaluationService');
const evaluationRepository = require('../src/repositories/evaluationRepository');
const atsClientService = require('../src/services/atsClientService');
const apiKeyGuard = require('../src/middlewares/apiKeyGuard');
const fileStorage = require('../src/utils/fileStorage');
const {
  checkCallbackUrl,
  isBlockedAddress,
  safeLookup,
  BLOCKED_CODE,
} = require('../src/utils/netSafety');

const { sampleResumePdf, sampleJob } = require('./helpers/fixtures');
const { startWebhookReceiver, DEAD_URL } = require('./helpers/webhookReceiver');
const { createAtsKey } = require('./helpers/ats');
const { asHr } = require('./helpers/auth');
const h = require('./helpers/schema');

const app = createApp();

/* ============================ small helpers ============================ */

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Run a block with the SSRF guard ON, as it is in production; restore afterwards. */
async function guarded(fn) {
  const original = config.webhookAllowInsecure;
  config.webhookAllowInsecure = false;
  try {
    return await fn();
  } finally {
    config.webhookAllowInsecure = original;
  }
}

/**
 * Make dns.lookup answer `addresses` for one hostname - the attacker's DNS server.
 * Every other name falls through to the real resolver.
 */
function fakeDns(hostname, addresses) {
  const real = dns.lookup;
  return jest.spyOn(dns, 'lookup').mockImplementation((name, options, callback) => {
    if (name !== hostname) return real(name, options, callback);
    const cb = typeof options === 'function' ? options : callback;
    return process.nextTick(() =>
      cb(
        null,
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
      )
    );
  });
}

async function createJob() {
  const { id, createdAt, ...body } = sampleJob();
  const res = await request(app).post('/api/jobs').set(asHr()).send(body);
  expect(res.status).toBe(201);
  return res.body;
}

const submit = (jobId, key, callbackUrl = DEAD_URL) =>
  request(app)
    .post(`/api/jobs/${jobId}/evaluations`)
    .set('x-api-key', key)
    .field('callbackUrl', callbackUrl)
    .attach('resume', sampleResumePdf(), 'resume.pdf');

const registration = (email = 'hr@example.com') => ({
  username: 'HR Admin',
  email,
  password: 'correct horse battery',
});
const register = (email) => request(app).post('/api/auth/register').send(registration(email));
const refresh = (refreshToken) =>
  request(app).post('/api/auth/refresh').send({ refreshToken });
const logout = (refreshToken) => request(app).post('/api/auth/logout').send({ refreshToken });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function countRows(table) {
  const { rows } = await db.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(rows[0].n);
}

/* ============================ lifecycle ============================ */

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await evaluationService.awaitPendingRuns();
  await db.close();
  fs.rmSync(fileStorage.UPLOADS_DIR, { recursive: true, force: true });
});

beforeEach(async () => {
  // The pipeline is not under test here; a fast, permanent LLM failure keeps any
  // background run that a 202 starts short and quiet.
  mockCreate.mockReset();
  mockCreate.mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
  await db.query('DELETE FROM evaluations');
  await db.query('DELETE FROM resumes');
  await db.query('DELETE FROM jobs');
  await db.query('DELETE FROM refresh_tokens');
  await db.query('DELETE FROM users');
  await db.query('DELETE FROM ats_clients');
});

afterEach(async () => {
  jest.restoreAllMocks();
  await evaluationService.awaitPendingRuns();
});

/* ================================================================== *
 * 1. Webhook SSRF
 * ================================================================== */
describe('Phase 7 - SSRF: the switch is OFF unless asked for', () => {
  test('WEBHOOK_ALLOW_INSECURE defaults to false', () => {
    const saved = process.env.WEBHOOK_ALLOW_INSECURE;
    delete process.env.WEBHOOK_ALLOW_INSECURE;
    try {
      jest.isolateModules(() => {
        expect(require('../src/config/env').webhookAllowInsecure).toBe(false);
      });
    } finally {
      process.env.WEBHOOK_ALLOW_INSECURE = saved;
    }
  });

  test('only the word "true" turns it on - a typo leaves it safe', () => {
    const saved = process.env.WEBHOOK_ALLOW_INSECURE;
    try {
      for (const [raw, expected] of [
        ['true', true],
        ['TRUE', true],
        ['yes', false],
        ['1', false],
        ['ture', false],
      ]) {
        process.env.WEBHOOK_ALLOW_INSECURE = raw;
        jest.isolateModules(() => {
          expect(require('../src/config/env').webhookAllowInsecure).toBe(expected);
        });
      }
    } finally {
      process.env.WEBHOOK_ALLOW_INSECURE = saved;
    }
  });
});

describe('Phase 7 - SSRF: the URL as written (checkCallbackUrl)', () => {
  test('a public https URL is accepted', () => {
    expect(checkCallbackUrl('https://ats.example.com/hooks/resume')).toBeNull();
    expect(checkCallbackUrl('https://8.8.8.8/hook')).toBeNull();
    expect(checkCallbackUrl('https://ats.example.com:8443/hook')).toBeNull();
  });

  test('plain http is refused', () => {
    expect(checkCallbackUrl('http://ats.example.com/hook')).toMatch(/must use https/);
  });

  test('schemes we cannot POST to are refused', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x']) {
      expect(checkCallbackUrl(url)).toMatch(/must use https/);
    }
  });

  test('something that is not a URL at all is refused', () => {
    expect(checkCallbackUrl('not a url')).toMatch(/valid https URL/);
  });

  test.each([
    ['localhost', 'https://localhost/hook'],
    ['a name under localhost', 'https://api.localhost/hook'],
    ['localhost with a trailing dot', 'https://localhost./hook'],
    ['loopback', 'https://127.0.0.1/hook'],
    ['loopback, elsewhere in 127/8', 'https://127.10.20.30/hook'],
    ['the cloud metadata service', 'https://169.254.169.254/latest/meta-data/'],
    ['private 10/8', 'https://10.0.0.5/hook'],
    ['private 172.16/12', 'https://172.16.0.1/hook'],
    ['private 172.16/12, top end', 'https://172.31.255.255/hook'],
    ['private 192.168/16', 'https://192.168.1.10/hook'],
    ['carrier-grade NAT', 'https://100.64.0.1/hook'],
    ['"this network"', 'https://0.0.0.0/hook'],
    ['broadcast', 'https://255.255.255.255/hook'],
    ['IPv6 loopback', 'https://[::1]/hook'],
    ['IPv6 unique-local', 'https://[fd00::1]/hook'],
    ['IPv6 link-local', 'https://[fe80::1]/hook'],
    ['IPv4-mapped IPv6 loopback', 'https://[::ffff:127.0.0.1]/hook'],
    ['IPv4-mapped IPv6 metadata service', 'https://[::ffff:169.254.169.254]/hook'],
    ['NAT64-wrapped address', 'https://[64:ff9b::7f00:1]/hook'],
    ['loopback written as one decimal number', 'https://2130706433/hook'],
    ['loopback written in hex', 'https://0x7f.0.0.1/hook'],
    ['loopback in shortened dotted form', 'https://127.1/hook'],
  ])('an internal address is refused: %s', (_, url) => {
    expect(checkCallbackUrl(url)).toMatch(/internal address/);
  });

  test('the edges of the private ranges are not over-blocked', () => {
    expect(checkCallbackUrl('https://172.15.255.255/hook')).toBeNull();
    expect(checkCallbackUrl('https://172.32.0.1/hook')).toBeNull();
    expect(checkCallbackUrl('https://11.0.0.1/hook')).toBeNull();
    expect(checkCallbackUrl('https://[2606:4700::1111]/hook')).toBeNull();
  });

  test('the development switch allows http and local addresses, but still only http(s)', () => {
    expect(checkCallbackUrl('http://127.0.0.1:9000/hook', { allowInsecure: true })).toBeNull();
    expect(checkCallbackUrl('ftp://example.com/x', { allowInsecure: true })).toMatch(
      /valid http\(s\) URL/
    );
  });

  test('isBlockedAddress refuses anything that is not an IP at all', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
  });

  test('public addresses in BOTH families pass - the IPv6 rules do not swallow IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111', '::ffff:8.8.8.8']) {
      expect(isBlockedAddress(ip)).toBe(false);
    }
  });
});

describe('Phase 7 - SSRF: the submit door refuses a dangerous callbackUrl (400)', () => {
  test.each([
    ['plain http', 'http://ats.example.com/hook', /must use https/],
    ['the metadata service', 'https://169.254.169.254/latest/meta-data/', /internal address/],
    ['localhost', 'https://localhost:4000/api/jobs', /internal address/],
    ['a private address', 'https://10.1.2.3/hook', /internal address/],
  ])('%s -> 400, and nothing is started', async (_, url, message) => {
    const job = await createJob();
    const key = await createAtsKey();

    const res = await guarded(() => submit(job.id, key, url));

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'callbackUrl', message: expect.stringMatching(message) }]);
    expect(await countRows('evaluations')).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('a public https callbackUrl is accepted -> 202', async () => {
    const job = await createJob();
    const key = await createAtsKey();
    // The background run would really try to reach ats.example.com; not the point here.
    jest
      .spyOn(webhookService, 'deliver')
      .mockResolvedValue({ deliveryStatus: 'delivered', attempts: 1 });

    const res = await guarded(() => submit(job.id, key, 'https://ats.example.com/hooks/resume'));

    expect(res.status).toBe(202);
  });
});

describe('Phase 7 - SSRF: checked again at send time (webhookService.deliver)', () => {
  let receiver;

  afterEach(async () => {
    if (receiver) await receiver.close();
    receiver = null;
  });

  test('a stored http URL to a local receiver is refused, and NOTHING is sent', async () => {
    receiver = await startWebhookReceiver();

    const outcome = await guarded(() => webhookService.deliver(receiver.url, { hello: true }));

    expect(outcome).toMatchObject({ deliveryStatus: 'failed', attempts: 0 });
    expect(outcome.error).toMatch(/^blocked:/);
    expect(receiver.requests).toHaveLength(0);
  });

  test('a stored URL with an internal IP is refused without a connection attempt', async () => {
    const lookup = jest.spyOn(dns, 'lookup');

    const outcome = await guarded(() =>
      webhookService.deliver('https://169.254.169.254/latest/meta-data/', { hello: true })
    );

    expect(outcome).toMatchObject({ deliveryStatus: 'failed', attempts: 0 });
    expect(lookup).not.toHaveBeenCalled();
  });

  test('DNS REBINDING: a public-looking name that resolves to 127.0.0.1 is refused, not retried', async () => {
    const lookup = fakeDns('rebind.attacker.test', ['127.0.0.1']);

    const outcome = await guarded(() =>
      webhookService.deliver('https://rebind.attacker.test/hook', { hello: true })
    );

    expect(outcome.deliveryStatus).toBe('failed');
    expect(outcome.attempts).toBe(1);
    expect(outcome.error).toMatch(/internal address \(127\.0\.0\.1\)/);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  test('a name resolving to the metadata service is refused', async () => {
    fakeDns('metadata.attacker.test', ['169.254.169.254']);

    const outcome = await guarded(() =>
      webhookService.deliver('https://metadata.attacker.test/', { hello: true })
    );

    expect(outcome).toMatchObject({ deliveryStatus: 'failed' });
    expect(outcome.error).toMatch(/169\.254\.169\.254/);
  });

  test('a name with one public AND one private address is refused outright', async () => {
    fakeDns('mixed.attacker.test', ['93.184.216.34', '10.0.0.7']);

    const outcome = await guarded(() =>
      webhookService.deliver('https://mixed.attacker.test/hook', { hello: true })
    );

    expect(outcome.deliveryStatus).toBe('failed');
    expect(outcome.error).toMatch(/10\.0\.0\.7/);
  });

  test('the check sits INSIDE the connection: the socket itself uses the guarded lookup', async () => {
    // postJson with pinning on, over plain http so no TLS gets in the way: the only
    // way this can fail with our blocked code is if the socket asked safeLookup.
    fakeDns('pinned.attacker.test', ['10.9.8.7']);

    await expect(
      webhookService.postJson(new URL('http://pinned.attacker.test/hook'), {}, { pinLookup: true })
    ).rejects.toMatchObject({ code: BLOCKED_CODE });
  });

  test('a redirect is NOT followed - it could point anywhere, including inside', async () => {
    receiver = await startWebhookReceiver({ respondWith: 302 });

    // Development mode, so the local receiver is reachable at all.
    const outcome = await webhookService.deliver(receiver.url, { hello: true });

    expect(outcome).toMatchObject({ deliveryStatus: 'failed', attempts: 1 });
    expect(outcome.error).toBe('responded 302');
    expect(receiver.requests).toHaveLength(1);
  });

  test('with the development switch on, a local receiver still gets the webhook', async () => {
    receiver = await startWebhookReceiver();

    const outcome = await webhookService.deliver(receiver.url, { hello: true });

    expect(outcome).toMatchObject({ deliveryStatus: 'delivered', attempts: 1 });
    expect(receiver.requests[0].body).toEqual({ hello: true });
    expect(receiver.requests[0].headers['content-type']).toMatch(/application\/json/);
  });

  test('a blocked delivery is recorded on the row; the result itself is untouched', async () => {
    const job = await createJob();
    // A row stored before the guard existed (or under the development switch), now
    // delivered under production rules - it must not be waved through.
    const evaluation = await evaluationRepository.createEvaluation({
      jobId: job.id,
      callbackUrl: DEAD_URL,
    });

    const finished = await guarded(() =>
      evaluationService.runPipeline({
        evaluation,
        job,
        stored: { filePath: 'data/test-uploads/generated-name.pdf' },
        fileKind: 'pdf',
        buffer: sampleResumePdf(),
      })
    );

    expect(finished.deliveryStatus).toBe('failed');
    // The mocked LLM's own outcome (a 400 from the provider is our fault, so
    // internal_error - doc 06), recorded honestly and not overwritten by the block.
    expect(finished.status).toBe('failed');
    expect(finished.failureReason).toBe('internal_error');
  });
});

describe('Phase 7 - SSRF: safeLookup, the resolver handed to the socket', () => {
  test('a public answer passes through in the single-address form', (done) => {
    fakeDns('ok.example.test', ['93.184.216.34']);
    safeLookup('ok.example.test', {}, (err, address, family) => {
      expect(err).toBeNull();
      expect(address).toBe('93.184.216.34');
      expect(family).toBe(4);
      done();
    });
  });

  test('...and in the list form newer sockets ask for', (done) => {
    fakeDns('ok.example.test', ['93.184.216.34', '2606:2800:220:1::1']);
    safeLookup('ok.example.test', { all: true }, (err, addresses) => {
      expect(err).toBeNull();
      expect(addresses.map((a) => a.address)).toEqual(['93.184.216.34', '2606:2800:220:1::1']);
      done();
    });
  });

  test('an internal answer fails with the blocked code', (done) => {
    fakeDns('bad.example.test', ['::1']);
    safeLookup('bad.example.test', (err) => {
      expect(err.code).toBe(BLOCKED_CODE);
      done();
    });
  });

  test('a DNS failure is passed on unchanged (a transient error, not a block)', (done) => {
    jest.spyOn(dns, 'lookup').mockImplementation((name, options, cb) =>
      process.nextTick(() => cb(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })))
    );
    safeLookup('nowhere.example.test', {}, (err) => {
      expect(err.code).toBe('ENOTFOUND');
      done();
    });
  });
});

/* ================================================================== *
 * 2. Refresh tokens
 * ================================================================== */
describe('Phase 7 - refresh tokens: issued with every login', () => {
  test('register returns an access token AND a refresh token', async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      token: expect.any(String),
      refreshToken: expect.any(String),
      user: expect.objectContaining({ email: 'hr@example.com' }),
    });
  });

  test('login returns the pair too', async () => {
    await register();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@example.com', password: 'correct horse battery' });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.token).toEqual(expect.any(String));
  });

  test('the access token now lives 15 minutes', async () => {
    const { body } = await register();
    const claims = jwt.decode(body.token);

    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  test('the refresh token lives 7 days (REFRESH_TOKEN_TTL_DAYS)', async () => {
    const before = Date.now();
    const { body } = await register();
    const { rows } = await db.query('SELECT expires_at FROM refresh_tokens');

    const ttl = Date.parse(rows[0].expires_at) - before;
    expect(config.refreshTokenTtlDays).toBe(7);
    expect(ttl).toBeGreaterThan(7 * 24 * 3600 * 1000 - 5000);
    expect(ttl).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 5000);
    expect(body.refreshToken).toBeDefined();
  });

  test('only a HASH is stored - the token itself is nowhere in the database', async () => {
    const { body } = await register();
    const { rows } = await db.query('SELECT * FROM refresh_tokens');

    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(sha256(body.refreshToken));
    expect(JSON.stringify(rows)).not.toContain(body.refreshToken);
  });

  test('every login gets its own refresh token', async () => {
    const first = await register();
    const second = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@example.com', password: 'correct horse battery' });

    expect(second.body.refreshToken).not.toBe(first.body.refreshToken);
    expect(await countRows('refresh_tokens')).toBe(2);
  });

  test('a refresh token is NOT an access token - the HR doors refuse it', async () => {
    const { body } = await register();
    const res = await request(app).get('/api/jobs').set(bearer(body.refreshToken));

    expect(res.status).toBe(401);
  });
});

describe('Phase 7 - refresh tokens: POST /api/auth/refresh (rotation)', () => {
  test('a valid refresh token -> 200 with a NEW pair, and the new access token works', async () => {
    const { body: first } = await register();

    const res = await refresh(first.refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(first.refreshToken);
    expect(res.body.user).toMatchObject({ email: 'hr@example.com' });
    expect((await request(app).get('/api/jobs').set(bearer(res.body.token))).status).toBe(200);
  });

  test('the refresh door needs no access token - it may well have expired', async () => {
    const { body } = await register();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set(bearer('expired.or.missing'))
      .send({ refreshToken: body.refreshToken });

    expect(res.status).toBe(200);
  });

  test('rotation: the token presented is spent and cannot be used twice', async () => {
    const { body } = await register();
    await refresh(body.refreshToken);

    const again = await refresh(body.refreshToken);

    expect(again.status).toBe(401);
    expect(again.body).toEqual({ error: 'unauthorized', message: 'Invalid refresh token' });
  });

  test('REUSE DETECTION: replaying a spent token logs that user out everywhere', async () => {
    const { body } = await register();
    const rotated = await refresh(body.refreshToken); // the real user refreshes...
    await refresh(body.refreshToken); // ...and a thief replays the old one

    // The thief got nothing, and the real user's current token is dead too: we cannot
    // tell which of them is which, so both must sign in with the password again.
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
    const { rows } = await db.query('SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked_at IS NULL');
    expect(rows[0].n).toBe(0);
  });

  test('reuse by one user leaves another user signed in', async () => {
    const { body: a } = await register('a@example.com');
    const { body: b } = await register('b@example.com');
    await refresh(a.refreshToken);
    await refresh(a.refreshToken);

    expect((await refresh(b.refreshToken)).status).toBe(200);
  });

  test('two simultaneous refreshes with the same token -> exactly one wins', async () => {
    const { body } = await register();

    const results = await Promise.all([refresh(body.refreshToken), refresh(body.refreshToken)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  test('an EXPIRED refresh token -> 401', async () => {
    const { body } = await register();
    await db.query('UPDATE refresh_tokens SET expires_at = $1', ['2000-01-01T00:00:00.000Z']);

    expect((await refresh(body.refreshToken)).status).toBe(401);
  });

  test('an unknown refresh token -> 401, the same answer as every other refusal', async () => {
    const res = await refresh('this-was-never-issued');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized', message: 'Invalid refresh token' });
  });

  test('a token whose account no longer exists -> 401', async () => {
    const { body } = await register();
    await db.query('PRAGMA foreign_keys = OFF');
    try {
      await db.query('DELETE FROM users');
    } finally {
      await db.query('PRAGMA foreign_keys = ON');
    }

    expect((await refresh(body.refreshToken)).status).toBe(401);
  });

  test.each([
    ['missing', {}],
    ['empty', { refreshToken: '' }],
    ['blank', { refreshToken: '   ' }],
    ['not a string', { refreshToken: 12345 }],
    ['absurdly long', { refreshToken: 'x'.repeat(513) }],
  ])('a %s refreshToken -> 400 from the guard', async (_, body) => {
    const res = await request(app).post('/api/auth/refresh').send(body);

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'refreshToken' });
  });
});

describe('Phase 7 - refresh tokens: POST /api/auth/logout', () => {
  test('logout -> 204, and the refresh token is dead from then on', async () => {
    const { body } = await register();

    const res = await logout(body.refreshToken);

    expect(res.status).toBe(204);
    expect((await refresh(body.refreshToken)).status).toBe(401);
  });

  test('logout ends THAT login only - another device stays signed in', async () => {
    const { body: laptop } = await register();
    const { body: phone } = await request(app)
      .post('/api/auth/login')
      .send({ email: 'hr@example.com', password: 'correct horse battery' });

    await logout(laptop.refreshToken);

    expect((await refresh(phone.refreshToken)).status).toBe(200);
  });

  test('logging out twice, or with an unknown token, is still 204 - it reveals nothing', async () => {
    const { body } = await register();
    await logout(body.refreshToken);

    expect((await logout(body.refreshToken)).status).toBe(204);
    expect((await logout('never-issued')).status).toBe(204);
  });

  test('logout needs no access token', async () => {
    const { body } = await register();

    expect((await logout(body.refreshToken)).status).toBe(204);
  });

  test('logout with no refreshToken -> 400', async () => {
    const res = await request(app).post('/api/auth/logout').send({});

    expect(res.status).toBe(400);
  });
});

describe('Phase 7 - refresh tokens: the table', () => {
  test('refresh_tokens has the designed columns', async () => {
    const cols = await h.columns('refresh_tokens');

    expect(Object.keys(cols).sort()).toEqual(
      ['created_at', 'expires_at', 'id', 'revoked_at', 'token_hash', 'user_id'].sort()
    );
    expect(cols.user_id.notNull).toBe(true);
    expect(cols.token_hash.notNull).toBe(true);
    expect(cols.revoked_at.notNull).toBe(false);
  });

  test('it belongs to users, and deleting the user deletes its logins', async () => {
    expect(await h.foreignKeys('refresh_tokens')).toEqual([
      { column: 'user_id', table: 'users', references: 'id', onDelete: 'CASCADE' },
    ]);
    await register();
    await db.query('DELETE FROM users');

    expect(await countRows('refresh_tokens')).toBe(0);
  });

  test('the same hash cannot be stored twice', async () => {
    const { body } = await register();
    const { rows } = await db.query('SELECT user_id FROM refresh_tokens');

    await expect(
      db.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
        rows[0].user_id,
        sha256(body.refreshToken),
        '2099-01-01T00:00:00.000Z',
      ])
    ).rejects.toThrow(/UNIQUE/);
  });
});

/* ================================================================== *
 * 3. Per-ATS API keys
 * ================================================================== */
describe('Phase 7 - per-ATS keys: HR issues them (POST /api/ats-clients)', () => {
  test('creating a client -> 201 with the client and its key, shown this once', async () => {
    const res = await request(app).post('/api/ats-clients').set(asHr()).send({ name: 'Company A' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      client: {
        id: expect.any(Number),
        name: 'Company A',
        active: true,
        revokedAt: null,
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
      apiKey: expect.stringMatching(/^ats_[A-Za-z0-9_-]{43}$/),
    });
  });

  test('only a HASH of the key is stored', async () => {
    const res = await request(app).post('/api/ats-clients').set(asHr()).send({ name: 'Company A' });
    const { rows } = await db.query('SELECT * FROM ats_clients');

    expect(rows[0].key_hash).toBe(sha256(res.body.apiKey));
    expect(JSON.stringify(rows)).not.toContain(res.body.apiKey);
  });

  test('two clients get two different keys', async () => {
    const a = await request(app).post('/api/ats-clients').set(asHr()).send({ name: 'Company A' });
    const b = await request(app).post('/api/ats-clients').set(asHr()).send({ name: 'Company B' });

    expect(a.body.apiKey).not.toBe(b.body.apiKey);
  });

  test.each([
    ['missing', {}],
    ['empty', { name: '' }],
    ['blank', { name: '   ' }],
    ['not a string', { name: 42 }],
    ['too long', { name: 'x'.repeat(101) }],
  ])('a %s name -> 400', async (_, body) => {
    const res = await request(app).post('/api/ats-clients').set(asHr()).send(body);

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'name' });
  });

  test('the name is trimmed', async () => {
    const res = await request(app).post('/api/ats-clients').set(asHr()).send({ name: '  Company A ' });

    expect(res.body.client.name).toBe('Company A');
  });
});

describe('Phase 7 - per-ATS keys: list and revoke', () => {
  test('GET /api/ats-clients lists every client - names and status, never keys or hashes', async () => {
    await createAtsKey('Company A');
    await createAtsKey('Company B');

    const res = await request(app).get('/api/ats-clients').set(asHr());

    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.name).sort()).toEqual(['Company A', 'Company B']);
    expect(JSON.stringify(res.body)).not.toMatch(/apiKey|keyHash|key_hash|ats_/);
  });

  test('revoking -> 200 with the client marked inactive', async () => {
    await createAtsKey('Company A');
    const [client] = (await request(app).get('/api/ats-clients').set(asHr())).body;

    const res = await request(app).post(`/api/ats-clients/${client.id}/revoke`).set(asHr());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: client.id, active: false, revokedAt: expect.any(String) });
  });

  test('revoking twice is harmless and keeps the first timestamp', async () => {
    await createAtsKey('Company A');
    const [client] = (await request(app).get('/api/ats-clients').set(asHr())).body;
    const first = await request(app).post(`/api/ats-clients/${client.id}/revoke`).set(asHr());

    const second = await request(app).post(`/api/ats-clients/${client.id}/revoke`).set(asHr());

    expect(second.status).toBe(200);
    expect(second.body.revokedAt).toBe(first.body.revokedAt);
  });

  test('a revoked client stays in the list, as the record of who had access', async () => {
    await createAtsKey('Company A');
    const [client] = (await request(app).get('/api/ats-clients').set(asHr())).body;
    await request(app).post(`/api/ats-clients/${client.id}/revoke`).set(asHr());

    const res = await request(app).get('/api/ats-clients').set(asHr());

    expect(res.body).toEqual([expect.objectContaining({ id: client.id, active: false })]);
  });

  test('revoking an unknown client -> 404', async () => {
    const res = await request(app).post('/api/ats-clients/999999/revoke').set(asHr());

    expect(res.status).toBe(404);
  });

  test('a malformed id -> 400', async () => {
    const res = await request(app).post('/api/ats-clients/abc/revoke').set(asHr());

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'id' });
  });
});

describe('Phase 7 - per-ATS keys: only HR manages them', () => {
  const doors = [
    ['post', '/api/ats-clients', { name: 'Company A' }],
    // Every row has three entries: Jest reads a three-argument test as one wanting a
    // done() callback whenever a row passes fewer.
    ['get', '/api/ats-clients', undefined],
    ['post', '/api/ats-clients/1/revoke', undefined],
  ];

  test.each(doors)('%s %s without a token -> 401', async (method, path, body) => {
    const res = await request(app)[method](path).send(body);

    expect(res.status).toBe(401);
  });

  test.each(doors)('%s %s with an ATS key instead of a token -> 401', async (method, path, body) => {
    const key = await createAtsKey('Company A');
    const res = await request(app)[method](path).set('x-api-key', key).send(body);

    expect(res.status).toBe(401);
  });
});

describe('Phase 7 - per-ATS keys: company A gets key A, company B gets key B', () => {
  test('each company\'s own key opens the submit door', async () => {
    const job = await createJob();
    const keyA = await createAtsKey('Company A');
    const keyB = await createAtsKey('Company B');

    expect((await submit(job.id, keyA)).status).toBe(202);
    expect((await submit(job.id, keyB)).status).toBe(202);
  });

  test('revoking B shuts B out and leaves A working', async () => {
    const job = await createJob();
    const keyA = await createAtsKey('Company A');
    const keyB = await createAtsKey('Company B');
    const clients = (await request(app).get('/api/ats-clients').set(asHr())).body;
    const b = clients.find((c) => c.name === 'Company B');

    await request(app).post(`/api/ats-clients/${b.id}/revoke`).set(asHr());

    const refused = await submit(job.id, keyB);
    expect(refused.status).toBe(401);
    expect((await submit(job.id, keyA)).status).toBe(202);
  });

  test('a revoked key and a key that never existed get the same answer', async () => {
    const job = await createJob();
    const key = await createAtsKey('Company A');
    const [client] = (await request(app).get('/api/ats-clients').set(asHr())).body;
    await request(app).post(`/api/ats-clients/${client.id}/revoke`).set(asHr());

    const revoked = await submit(job.id, key);
    const unknown = await submit(job.id, 'ats_never-issued');

    expect(revoked.status).toBe(401);
    expect(revoked.body).toEqual(unknown.body);
  });

  test('a revoked key starts nothing: no row, no LLM call', async () => {
    const job = await createJob();
    const key = await createAtsKey('Company A');
    const [client] = (await request(app).get('/api/ats-clients').set(asHr())).body;
    await request(app).post(`/api/ats-clients/${client.id}/revoke`).set(asHr());

    await submit(job.id, key);

    expect(await countRows('evaluations')).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('the old shared .env key is retired - it opens nothing', async () => {
    const job = await createJob();

    expect(config).not.toHaveProperty('atsApiKey');
    expect((await submit(job.id, 'test-ats-key')).status).toBe(401);
    expect((await submit(job.id, 'change-me-shared-with-the-ats')).status).toBe(401);
  });

  test('the guard tells the rest of the request WHICH ats is calling', async () => {
    const key = await createAtsKey('Company A');
    const req = { get: () => key };
    const next = jest.fn();

    await apiKeyGuard(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.atsClient).toEqual({ id: expect.any(Number), name: 'Company A' });
  });

  test('an HR token still cannot submit a resume', async () => {
    const job = await createJob();
    const res = await request(app)
      .post(`/api/jobs/${job.id}/evaluations`)
      .set(asHr())
      .field('callbackUrl', DEAD_URL)
      .attach('resume', sampleResumePdf(), 'resume.pdf');

    expect(res.status).toBe(401);
  });

  test('authenticate() answers null for unknown and revoked keys alike', async () => {
    const { client, apiKey } = await atsClientService.createClient({ name: 'Company A' });
    expect(await atsClientService.authenticate(apiKey)).toMatchObject({ id: client.id });

    await atsClientService.revokeClient(client.id);

    expect(await atsClientService.authenticate(apiKey)).toBeNull();
    expect(await atsClientService.authenticate('ats_unknown')).toBeNull();
  });
});

describe('Phase 7 - per-ATS keys: the table', () => {
  test('ats_clients has the designed columns', async () => {
    const cols = await h.columns('ats_clients');

    expect(Object.keys(cols).sort()).toEqual(
      ['created_at', 'id', 'key_hash', 'name', 'revoked_at'].sort()
    );
    expect(cols.name.notNull).toBe(true);
    expect(cols.key_hash.notNull).toBe(true);
    expect(cols.revoked_at.notNull).toBe(false);
  });

  test('a blank name is refused by the database too', async () => {
    await expect(
      db.query('INSERT INTO ats_clients (name, key_hash) VALUES ($1, $2)', ['  ', sha256('x')])
    ).rejects.toThrow(/CHECK/);
  });

  test('the same key hash cannot be stored twice', async () => {
    await db.query('INSERT INTO ats_clients (name, key_hash) VALUES ($1, $2)', ['A', sha256('x')]);

    await expect(
      db.query('INSERT INTO ats_clients (name, key_hash) VALUES ($1, $2)', ['B', sha256('x')])
    ).rejects.toThrow(/UNIQUE/);
  });
});
