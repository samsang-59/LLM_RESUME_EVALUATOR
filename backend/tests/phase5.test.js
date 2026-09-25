// Phase 5 test round - authentication: register, login, and the two guards.
//
// Nothing is mocked. bcrypt really hashes (at a low cost factor, set in .env.test -
// what is under test is our code, not bcrypt's arithmetic), jsonwebtoken really
// signs, and every request goes through the real Express app.
//
// Two questions run through the whole file, because they are the two that matter
// about auth: can the right person get in, and - much more interesting - can
// everybody else be kept out. So the forged tokens here are forged properly: a
// tampered payload, a foreign signing key, an expired claim, and the classic
// "alg: none" trick that turns an unsigned token into a valid-looking one.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const createApp = require('../src/app');
const db = require('../src/config/db');
const config = require('../src/config/env');
const { runMigrations } = require('../src/config/migrator');

const userRepository = require('../src/repositories/userRepository');
const tokenService = require('../src/services/tokenService');
const authService = require('../src/services/authService');
const jwtGuard = require('../src/middlewares/jwtGuard');
const { UnauthorizedError, ConflictError } = require('../src/utils/errors');

const app = createApp();

/* ============================ small helpers ============================ */

/** A complete, valid registration - each bad-input test changes exactly one field. */
const validRegistration = () => ({
  username: 'HR Admin',
  email: 'hr@example.com',
  password: 'correct horse battery',
});

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (body) => request(app).post('/api/auth/login').send(body);

/** Register through the real door and hand back the token it issued. */
async function registeredToken(overrides = {}) {
  const res = await register({ ...validRegistration(), ...overrides });
  expect(res.status).toBe(201);
  return res.body.token;
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** The users row as the database actually holds it - hash included. */
async function readUser(email) {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

/**
 * Every door jwtGuard now stands in front of (doc 09). Kept as one list because the
 * point of the guard is that it is on ALL of them - a door left off this list is a
 * door somebody can walk through.
 */
const HR_DOORS = [
  ['POST', '/api/jobs'],
  ['GET', '/api/jobs'],
  ['GET', '/api/jobs/1'],
  ['GET', '/api/jobs/1/evaluations'],
  ['GET', '/api/evaluations/1'],
];

const call = ([method, path]) =>
  method === 'POST' ? request(app).post(path) : request(app).get(path);

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
  await db.query('DELETE FROM users');
});

/* ================================================================== */
describe('Phase 5 - POST /api/auth/register', () => {
  test('a valid registration -> 201 with a token and the new user', async () => {
    const res = await register(validRegistration());

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      id: expect.any(Number),
      username: 'HR Admin',
      email: 'hr@example.com',
    });
    expect(res.body.user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('the token works immediately - registering IS logging in', async () => {
    const { body } = await register(validRegistration());

    const res = await request(app).get('/api/jobs').set(bearer(body.token));

    expect(res.status).toBe(200);
  });

  test('the password is never returned, in any shape', async () => {
    const res = await register(validRegistration());

    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('correct horse battery');
  });

  test('what is STORED is a bcrypt hash, never the password itself', async () => {
    await register(validRegistration());

    const row = await readUser('hr@example.com');

    expect(row.password_hash).not.toBe('correct horse battery');
    expect(row.password_hash).toMatch(/^\$2[aby]\$/); // a bcrypt hash, by its prefix
    expect(await bcrypt.compare('correct horse battery', row.password_hash)).toBe(true);
  });

  test('two people who chose the SAME password get different hashes - bcrypt salts', async () => {
    await register(validRegistration());
    await register({ ...validRegistration(), email: 'second@example.com' });

    const first = await readUser('hr@example.com');
    const second = await readUser('second@example.com');

    // Identical hashes would mean a single cracked password unlocks every account
    // that shares it, and would let anyone spot which users share one.
    expect(first.password_hash).not.toBe(second.password_hash);
  });

  test('a duplicate email -> 409', async () => {
    await register(validRegistration());

    const res = await register({ ...validRegistration(), username: 'Someone Else' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'conflict' });
  });

  test('a duplicate in different case or with spaces is still a duplicate', async () => {
    await register(validRegistration());

    const res = await register({ ...validRegistration(), email: '  HR@Example.COM  ' });

    // Normalised before it reaches the database, or the UNIQUE constraint would be
    // comparing bytes and would happily accept the same person twice.
    expect(res.status).toBe(409);
  });

  test('the email is stored normalised', async () => {
    const res = await register({ ...validRegistration(), email: 'HR@Example.COM' });

    expect(res.body.user.email).toBe('hr@example.com');
    expect(await readUser('hr@example.com')).not.toBe(null);
  });

  test('a duplicate registration leaves exactly one user behind', async () => {
    await register(validRegistration());
    await register(validRegistration());

    const { rows } = await db.query('SELECT COUNT(*) AS n FROM users');
    expect(rows[0].n).toBe(1);
  });

  test('a password under 8 characters -> 400', async () => {
    const res = await register({ ...validRegistration(), password: 'short12' });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'password' });
  });

  test('exactly 8 characters is accepted - the rule is >=, not >', async () => {
    const res = await register({ ...validRegistration(), password: '12345678' });

    expect(res.status).toBe(201);
  });

  test('a password longer than bcrypt can hash (72 bytes) -> 400, not a silent truncation', async () => {
    const res = await register({ ...validRegistration(), password: 'a'.repeat(73) });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'password' });
  });

  test('the 72-byte limit counts BYTES, not characters', async () => {
    // 40 emoji are 40 characters and 160 bytes - accepting this would mean two
    // different long passwords could open the same account.
    const res = await register({ ...validRegistration(), password: '🔐'.repeat(40) });

    expect(res.status).toBe(400);
  });

  test('a password is not trimmed - a space is a character somebody meant', async () => {
    const res = await register({ ...validRegistration(), password: '  spaced out  ' });
    expect(res.status).toBe(201);

    const ok = await login({ email: 'hr@example.com', password: '  spaced out  ' });
    const trimmed = await login({ email: 'hr@example.com', password: 'spaced out' });

    expect(ok.status).toBe(200);
    expect(trimmed.status).toBe(401);
  });

  test('an invalid email -> 400', async () => {
    for (const email of ['not-an-email', 'missing@tld', '@example.com', 'hr @example.com']) {
      const res = await register({ ...validRegistration(), email });
      expect(res.status).toBe(400);
      expect(res.body.details[0]).toMatchObject({ field: 'email' });
    }
  });

  test('a missing username, email or password -> 400, naming the field', async () => {
    for (const field of ['username', 'email', 'password']) {
      const body = validRegistration();
      delete body[field];

      const res = await register(body);

      expect(res.status).toBe(400);
      expect(res.body.details.some((d) => d.field === field)).toBe(true);
    }
  });

  test('a whitespace-only username -> 400', async () => {
    const res = await register({ ...validRegistration(), username: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'username' });
  });

  test('the wrong TYPE for any field -> 400', async () => {
    expect((await register({ ...validRegistration(), username: 42 })).status).toBe(400);
    expect((await register({ ...validRegistration(), email: ['a@b.com'] })).status).toBe(400);
    expect((await register({ ...validRegistration(), password: 12345678 })).status).toBe(400);
  });

  test('an empty body -> 400 listing every missing field at once', async () => {
    const res = await register({});

    expect(res.status).toBe(400);
    expect(res.body.details.map((d) => d.field).sort()).toEqual([
      'email',
      'password',
      'username',
    ]);
  });

  test('extra fields are ignored - nobody registers themselves an id or a role', async () => {
    const res = await register({ ...validRegistration(), id: 999, role: 'admin', isAdmin: true });

    expect(res.status).toBe(201);
    expect(res.body.user.id).not.toBe(999);
    expect(res.body.user).not.toHaveProperty('role');
    expect(res.body.user).not.toHaveProperty('isAdmin');
  });

  test('a rejected registration writes no user at all', async () => {
    await register({ ...validRegistration(), password: 'short' });

    const { rows } = await db.query('SELECT COUNT(*) AS n FROM users');
    expect(rows[0].n).toBe(0);
  });
});

/* ================================================================== */
describe('Phase 5 - POST /api/auth/login', () => {
  beforeEach(async () => {
    await register(validRegistration());
  });

  test('the right password -> 200 with a token and the user', async () => {
    const res = await login({ email: 'hr@example.com', password: 'correct horse battery' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ username: 'HR Admin', email: 'hr@example.com' });
  });

  test('the token from login opens the HR doors', async () => {
    const { body } = await login({ email: 'hr@example.com', password: 'correct horse battery' });

    const res = await request(app).get('/api/jobs').set(bearer(body.token));

    expect(res.status).toBe(200);
  });

  test('a wrong password -> 401', async () => {
    const res = await login({ email: 'hr@example.com', password: 'wrong password!' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'unauthorized' });
  });

  test('an unknown email -> 401', async () => {
    const res = await login({ email: 'nobody@example.com', password: 'correct horse battery' });

    expect(res.status).toBe(401);
  });

  test('both failures answer identically - the door never says who has an account', async () => {
    const wrongPassword = await login({ email: 'hr@example.com', password: 'wrong password!' });
    const unknownEmail = await login({
      email: 'nobody@example.com',
      password: 'correct horse battery',
    });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test('an unknown email still pays for a comparison - the timing does not leak either', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');

    await login({ email: 'nobody@example.com', password: 'correct horse battery' });

    // Returning early for an unknown email would answer measurably faster than a
    // wrong password does, which tells an attacker exactly what the message refuses
    // to. The decoy hash costs the same as a real one.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('login is case-insensitive about the email, exactly as registration was', async () => {
    const res = await login({ email: '  HR@Example.COM ', password: 'correct horse battery' });

    expect(res.status).toBe(200);
  });

  test('login never returns the hash', async () => {
    const res = await login({ email: 'hr@example.com', password: 'correct horse battery' });

    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  test('a missing email or password -> 400, before any lookup', async () => {
    expect((await login({ password: 'correct horse battery' })).status).toBe(400);
    expect((await login({ email: 'hr@example.com' })).status).toBe(400);
    expect((await login({})).status).toBe(400);
  });

  test('an invalid email format -> 400, not 401', async () => {
    const res = await login({ email: 'not-an-email', password: 'correct horse battery' });

    expect(res.status).toBe(400);
    expect(res.body.details[0]).toMatchObject({ field: 'email' });
  });

  test('an empty password -> 400 from the guard', async () => {
    const res = await login({ email: 'hr@example.com', password: '' });

    expect(res.status).toBe(400);
  });

  test("login does NOT apply register's length rule - an old password must still work", async () => {
    // Rejecting a short password here would tell an attacker which guesses were not
    // even worth trying, and would lock out any account whose password predates the
    // rule. The guard checks that something was sent; bcrypt decides if it is right.
    const res = await login({ email: 'hr@example.com', password: 'short' });

    expect(res.status).toBe(401);
  });
});

/* ================================================================== */
describe('Phase 5 - the JWT guard on the HR doors (doc 09)', () => {
  let token;
  beforeEach(async () => {
    token = await registeredToken();
  });

  test('every HR door refuses a request with no token -> 401', async () => {
    for (const door of HR_DOORS) {
      const res = await call(door);
      expect([door.join(' '), res.status]).toEqual([door.join(' '), 401]);
      expect(res.body).toMatchObject({ error: 'unauthorized' });
    }
  });

  test('every HR door accepts a valid token', async () => {
    const created = await request(app)
      .post('/api/jobs')
      .set(bearer(token))
      .send({
        title: 'Backend Developer',
        mustHaveSkills: ['Node.js'],
        matchingMode: 'strict',
        cutoffPercentage: 70,
      });
    expect(created.status).toBe(201);

    const doors = [
      ['GET', '/api/jobs'],
      ['GET', `/api/jobs/${created.body.id}`],
      ['GET', `/api/jobs/${created.body.id}/evaluations`],
    ];
    for (const door of doors) {
      const res = await call(door).set(bearer(token));
      expect([door.join(' '), res.status]).toEqual([door.join(' '), 200]);
    }
  });

  test('an EXPIRED token -> 401', async () => {
    const expired = jwt.sign({ sub: 1, email: 'hr@example.com' }, config.jwtSecret, {
      expiresIn: '-1s',
    });

    const res = await request(app).get('/api/jobs').set(bearer(expired));

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('a TAMPERED token -> 401: the payload cannot be edited without the key', async () => {
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    claims.sub = 999; // "log me in as somebody else"
    const forgedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');

    const res = await request(app)
      .get('/api/jobs')
      .set(bearer(`${header}.${forgedPayload}.${signature}`));

    expect(res.status).toBe(401);
  });

  test('a token signed with a DIFFERENT secret -> 401', async () => {
    const foreign = jwt.sign({ sub: 1, email: 'hr@example.com' }, 'some-other-secret');

    const res = await request(app).get('/api/jobs').set(bearer(foreign));

    expect(res.status).toBe(401);
  });

  test('the "alg: none" trick -> 401: an unsigned token is not a token', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 1 })}.`;

    const res = await request(app).get('/api/jobs').set(bearer(unsigned));

    expect(res.status).toBe(401);
  });

  test('garbage in the header -> 401, not a 500', async () => {
    for (const value of ['Bearer not-a-jwt', 'Bearer a.b.c', 'Bearer ', 'Bearer .']) {
      const res = await request(app).get('/api/jobs').set({ Authorization: value });
      expect(res.status).toBe(401);
    }
  });

  test('a bare token with no scheme -> 401', async () => {
    const res = await request(app).get('/api/jobs').set({ Authorization: token });

    expect(res.status).toBe(401);
  });

  test('a different scheme (Basic) -> 401', async () => {
    const basic = Buffer.from('hr@example.com:correct horse battery').toString('base64');

    const res = await request(app).get('/api/jobs').set({ Authorization: `Basic ${basic}` });

    expect(res.status).toBe(401);
  });

  test('the scheme is case-insensitive, as HTTP says it is', async () => {
    const res = await request(app).get('/api/jobs').set({ Authorization: `bearer ${token}` });

    expect(res.status).toBe(200);
  });

  test('an unauthorised call touches nothing - no query is ever run', async () => {
    const spy = jest.spyOn(db, 'query');
    await request(app).get('/api/jobs/1/evaluations?eligible=true');
    const calls = spy.mock.calls.length;
    spy.mockRestore();

    expect(calls).toBe(0);
  });

  test('the guard runs BEFORE the input guards - a bad id with no token is still 401', async () => {
    // Order matters: answering 400 here would confirm to an anonymous caller that
    // they had at least found a real door.
    const res = await request(app).get('/api/jobs/abc');

    expect(res.status).toBe(401);
  });

  test('the 401 body has the same shape as every other error', async () => {
    const res = await request(app).get('/api/jobs');

    expect(res.body).toMatchObject({ error: 'unauthorized', message: expect.any(String) });
    expect(res.body).not.toHaveProperty('stack');
  });
});

/* ================================================================== */
describe('Phase 5 - two callers, two mechanisms (doc 09)', () => {
  test('the ATS submit door does NOT accept an HR token - it wants the API key', async () => {
    const token = await registeredToken();
    const created = await request(app)
      .post('/api/jobs')
      .set(bearer(token))
      .send({
        title: 'Backend Developer',
        mustHaveSkills: ['Node.js'],
        matchingMode: 'strict',
        cutoffPercentage: 70,
      });

    const res = await request(app)
      .post(`/api/jobs/${created.body.id}/evaluations`)
      .set(bearer(token));

    expect(res.status).toBe(401);
  });

  test('the HR read doors do NOT accept the ATS key - a machine is not a person', async () => {
    const res = await request(app).get('/api/jobs').set('x-api-key', config.atsApiKey);

    expect(res.status).toBe(401);
  });

  test('the auth doors themselves are open - they are how you get a token', async () => {
    expect((await register(validRegistration())).status).toBe(201);
    expect(
      (await login({ email: 'hr@example.com', password: 'correct horse battery' })).status
    ).toBe(200);
  });

  test('/health stays open - a monitor cannot be asked to log in', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });

  test('an unknown path is still 404, not 401', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
  });
});

/* ================================================================== */
describe('Phase 5 - the layers underneath', () => {
  test('a token round-trips: sign it, verify it, get the user back', () => {
    const token = tokenService.generateToken({ id: 7, email: 'hr@example.com' });

    expect(tokenService.verifyToken(token)).toEqual({ id: 7, email: 'hr@example.com' });
  });

  test('the payload carries the minimum - never the password or the hash', () => {
    const token = tokenService.generateToken({
      id: 7,
      email: 'hr@example.com',
      passwordHash: '$2b$04$secret',
    });

    const claims = jwt.decode(token);

    // A JWT is signed, not encrypted: anything in here is readable by whoever holds
    // the token.
    expect(Object.keys(claims).sort()).toEqual(['email', 'exp', 'iat', 'sub']);
    expect(token).not.toContain('secret');
  });

  test('the token expires in a day (doc 09), not never', () => {
    const claims = jwt.decode(tokenService.generateToken({ id: 1, email: 'hr@example.com' }));

    expect(claims.exp - claims.iat).toBe(24 * 60 * 60);
  });

  test('verifyToken throws Unauthorized for expired, foreign and malformed tokens alike', () => {
    const expired = jwt.sign({ sub: 1 }, config.jwtSecret, { expiresIn: '-1s' });
    const foreign = jwt.sign({ sub: 1 }, 'another-secret');

    expect(() => tokenService.verifyToken(expired)).toThrow(UnauthorizedError);
    expect(() => tokenService.verifyToken(foreign)).toThrow(UnauthorizedError);
    expect(() => tokenService.verifyToken('nonsense')).toThrow(UnauthorizedError);
  });

  test('a token whose subject is not a real id is refused, however well signed', () => {
    const notOurs = jwt.sign({ sub: 'admin' }, config.jwtSecret);

    expect(() => tokenService.verifyToken(notOurs)).toThrow(UnauthorizedError);
  });

  test('jwtGuard attaches req.user and calls next with nothing', () => {
    const token = tokenService.generateToken({ id: 7, email: 'hr@example.com' });
    const req = { get: () => `Bearer ${token}` };
    const next = jest.fn();

    jwtGuard(req, {}, next);

    expect(req.user).toEqual({ id: 7, email: 'hr@example.com' });
    expect(next).toHaveBeenCalledWith();
  });

  test('jwtGuard hands the error to next, it never throws at Express', () => {
    const req = { get: () => undefined };
    const next = jest.fn();

    expect(() => jwtGuard(req, {}, next)).not.toThrow();
    expect(next.mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  test('getUserByEmail returns null for an unknown email', async () => {
    await expect(userRepository.getUserByEmail('nobody@example.com')).resolves.toBe(null);
  });

  test('the hash comes back only when it is explicitly asked for', async () => {
    await authService.register({
      username: 'HR Admin',
      email: 'hr@example.com',
      password: 'correct horse battery',
    });

    const plain = await userRepository.getUserByEmail('hr@example.com');
    const forLogin = await userRepository.getUserByEmail('hr@example.com', {
      withPasswordHash: true,
    });

    expect(plain).not.toHaveProperty('passwordHash');
    expect(forLogin.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('the UNIQUE constraint is the real guarantee - the repository turns it into a 409', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery', config.bcryptRounds);
    await userRepository.createUser({
      username: 'HR Admin',
      email: 'hr@example.com',
      passwordHash,
    });

    // Straight past the service's friendly check, exactly as a second simultaneous
    // registration would slip past it.
    await expect(
      userRepository.createUser({ username: 'Someone Else', email: 'hr@example.com', passwordHash })
    ).rejects.toThrow(ConflictError);
  });

  test('authService.login rejects with Unauthorized, not by returning null', async () => {
    await authService.register({
      username: 'HR Admin',
      email: 'hr@example.com',
      password: 'correct horse battery',
    });

    await expect(
      authService.login({ email: 'hr@example.com', password: 'wrong password!' })
    ).rejects.toThrow(UnauthorizedError);
  });
});
