// Runs before any module loads, so config/env.js picks up .env.test.
process.env.NODE_ENV = 'test';

// The webhook receivers in these suites are real servers on http://127.0.0.1, which
// is exactly what the SSRF guard exists to refuse (Phase 7). So the suite runs with
// the development switch on; the Phase 7 round turns it off to test the guard itself.
// Set here rather than in .env.test so a fresh clone behaves the same way.
process.env.WEBHOOK_ALLOW_INSECURE = 'true';
