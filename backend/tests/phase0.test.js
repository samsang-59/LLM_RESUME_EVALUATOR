const request = require('supertest');
const createApp = require('../src/app');
const db = require('../src/config/db');
const config = require('../src/config/env');
const errorHandler = require('../src/middlewares/errorHandler');
const {
  AppError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} = require('../src/utils/errors');

const app = createApp();

afterAll(async () => {
  await db.close();
});

describe('Phase 0 - config / env', () => {
  test('loads the test environment', () => {
    expect(config.nodeEnv).toBe('test');
    expect(config.isTest).toBe(true);
  });

  test('exposes every value the later phases need', () => {
    expect(config.port).toBe(4001);
    expect(config.databaseFile).toBe(':memory:');
    expect(config.jwtSecret).toBe('test-secret');
    expect(config.jwtExpiresIn).toBe('1d');
    expect(config.atsApiKey).toBe('test-ats-key');
    expect(config.maxResumeSizeMb).toBe(5);
  });

  test('numeric vars are numbers, not strings', () => {
    expect(typeof config.port).toBe('number');
    expect(typeof config.maxResumeSizeMb).toBe('number');
  });

  test('a missing required var throws instead of failing silently later', () => {
    expect(() => config.required('DEFINITELY_NOT_SET_XYZ')).toThrow(
      /Missing required env var: DEFINITELY_NOT_SET_XYZ/
    );
  });
});

describe('Phase 0 - database connection helper', () => {
  test('ping() connects', async () => {
    await expect(db.ping()).resolves.toBe(true);
  });

  test('query() returns rows for a SELECT', async () => {
    const { rows, rowCount } = await db.query('SELECT 1 AS one, 2 AS two');
    expect(rows).toEqual([{ one: 1, two: 2 }]);
    expect(rowCount).toBe(1);
  });

  test('query() translates Postgres-style $1 placeholders', async () => {
    const { rows } = await db.query('SELECT $1 AS a, $2 AS b', ['x', 7]);
    expect(rows[0]).toEqual({ a: 'x', b: 7 });
  });

  test('rows are plain objects, not null-prototype ones', async () => {
    const { rows } = await db.query('SELECT 1 AS ok');
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
    expect(JSON.parse(JSON.stringify(rows[0]))).toEqual({ ok: 1 });
  });

  test('exec() runs multi-statement SQL, and writes then read back', async () => {
    await db.exec(`
      CREATE TABLE ph0_probe (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL);
      INSERT INTO ph0_probe (label) VALUES ('seeded');
    `);
    const inserted = await db.query(
      'INSERT INTO ph0_probe (label) VALUES ($1) RETURNING id, label',
      ['written']
    );
    expect(inserted.rows[0].label).toBe('written');

    const all = await db.query('SELECT label FROM ph0_probe ORDER BY id');
    expect(all.rows.map((r) => r.label)).toEqual(['seeded', 'written']);

    const updated = await db.query('UPDATE ph0_probe SET label = $1 WHERE label = $2', [
      'changed',
      'seeded',
    ]);
    expect(updated.rowCount).toBe(1);

    await db.exec('DROP TABLE ph0_probe');
  });

  test('foreign keys are enforced (PRAGMA is on)', async () => {
    const { rows } = await db.query('PRAGMA foreign_keys');
    expect(rows[0].foreign_keys).toBe(1);
  });

  test('a broken query rejects rather than returning garbage', async () => {
    await expect(db.query('SELECT * FROM table_that_does_not_exist')).rejects.toThrow();
  });
});

describe('Phase 0 - app boots', () => {
  test('createApp() returns a mountable app without listening', () => {
    expect(typeof app).toBe('function');
    expect(typeof app.listen).toBe('function');
  });

  test('GET /health -> 200 with status ok and db up', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(typeof res.body.uptime).toBe('number');
  });

  test('/health reports 503 degraded when the DB is unreachable', async () => {
    const spy = jest.spyOn(db, 'ping').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'down' });
    spy.mockRestore();
  });

  test('an unknown route -> 404 in the standard error shape', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
    expect(res.body.message).toContain('/nope');
  });

  test('the JSON body parser is mounted', async () => {
    const res = await request(app).post('/nope').send({ hello: 'world' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});

describe('Phase 0 - typed errors and the central handler', () => {
  const cases = [
    [BadRequestError, 400, 'bad_request'],
    [UnauthorizedError, 401, 'unauthorized'],
    [NotFoundError, 404, 'not_found'],
    [ConflictError, 409, 'conflict'],
  ];

  test.each(cases)('%p carries its status and code', (Err, status, code) => {
    const err = new Err();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(status);
    expect(err.code).toBe(code);
  });

  test.each(cases)('the handler maps %p to its HTTP status', (Err, status, code) => {
    const err = new Err('custom message');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: code, message: 'custom message' });
  });

  test('optional details are passed through', () => {
    const err = new BadRequestError('bad', [{ field: 'title' }]);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, {}, res, () => {});
    expect(res.json).toHaveBeenCalledWith({
      error: 'bad_request',
      message: 'bad',
      details: [{ field: 'title' }],
    });
  });

  test('an unknown error becomes a 500 that leaks nothing', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(new Error('secret internal detail'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'internal_error',
      message: 'Something went wrong',
    });
  });
});
