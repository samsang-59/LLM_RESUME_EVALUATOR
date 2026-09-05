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

  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  atsApiKey: process.env.ATS_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  maxResumeSizeMb: parseInt(process.env.MAX_RESUME_SIZE_MB || '5', 10),

  // Exposed so a test can assert the missing-var guard actually throws.
  required,
};

module.exports = config;
