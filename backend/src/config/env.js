// The ONE place that reads process.env. Everything else imports this config object.
const path = require('path');
const dotenv = require('dotenv');

const NODE_ENV = process.env.NODE_ENV || 'development';

// Tests load .env.test, everything else loads .env.
const envFile = NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(__dirname, '../../', envFile), quiet: true });

// Fail loudly at boot rather than mysteriously at the first query.
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Numbers that may legitimately be 0 (retry delays), so `||` defaulting would be wrong.
function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

const config = {
  nodeEnv: NODE_ENV,
  isTest: NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '4000', 10),

  // Phase 0 uses node:sqlite. ':memory:' is honoured as-is; a path is resolved
  // against the backend root so it does not depend on the working directory.
  databaseFile: required('DATABASE_FILE'),

  // Picks migrations/<dialect>/ and (later) the driver. 'sqlite' now, 'postgres'
  // after the upgrade - the repositories never see the difference.
  dbDialect: process.env.DB_DIALECT || 'sqlite',

  // A missing secret in production would mean every token is signed with a value
  // published in this repository - i.e. anyone could mint one. So it is required
  // there, and only there, so a fresh clone still runs.
  jwtSecret: NODE_ENV === 'production' ? required('JWT_SECRET') : process.env.JWT_SECRET || 'dev-secret',
  // One day (doc 09): a JWT cannot be withdrawn once issued, so the expiry is what
  // bounds the damage if one leaks.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  // bcrypt's cost factor. Deliberate slowness - it is what makes brute-forcing a
  // stolen hash table expensive. 10 is the usual production floor. Tests default to
  // 4 (and .env.test says so explicitly): what they check is our code, not bcrypt's
  // arithmetic, and 10 rounds x a whole auth suite is minutes of pure waiting.
  bcryptRounds: num('BCRYPT_ROUNDS', NODE_ENV === 'test' ? 4 : 10),
  atsApiKey: process.env.ATS_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  maxResumeSizeMb: parseInt(process.env.MAX_RESUME_SIZE_MB || '5', 10),

  // ---- Phase 3: the evaluation pipeline ----

  // Where the original PDF/DOCX is kept. The DB stores only the path (doc 02).
  uploadsDir: process.env.UPLOADS_DIR || './data/uploads',

  // The LLM adapter. Temperature is ~0 on purpose: we want exact, repeatable facts,
  // not creativity (doc 06). Retries cover network / overload only - a malformed
  // reply fails fast, so retrying it would only burn money.
  llmModel: process.env.LLM_MODEL || 'gpt-4o-mini',
  llmTemperature: num('LLM_TEMPERATURE', 0),
  llmMaxRetries: num('LLM_MAX_RETRIES', 2),
  llmRetryBaseMs: num('LLM_RETRY_BASE_MS', 300),
  llmTimeoutMs: num('LLM_TIMEOUT_MS', 30000),

  // The webhook. Transient failures on the caller's side are retried; permanent
  // ones are not (doc 06). Tests set the base delay to 0 to stay fast.
  webhookMaxRetries: num('WEBHOOK_MAX_RETRIES', 2),
  webhookRetryBaseMs: num('WEBHOOK_RETRY_BASE_MS', 300),
  webhookTimeoutMs: num('WEBHOOK_TIMEOUT_MS', 10000),

  // Exposed so a test can assert the missing-var guard actually throws.
  required,
};

module.exports = config;
