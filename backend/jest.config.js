module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // The DB is a single file/connection; run serially so phases never race each other.
  maxWorkers: 1,
};
