// Runs the frontend suite and writes the Phase 6 report into tests/reports/phase-6.md.
//
// Like the backend's scripts/test-report.js, the report is generated from the test
// runner's own JSON output (Vitest emits Jest's format), never hand-written, so it
// can never drift from what the tests actually did.
//
//   npm run test:report
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_DIR = path.join(ROOT, 'tests', 'reports');
const JSON_OUT = path.join(REPORTS_DIR, '.last-run.json');
const ICON = { passed: '✅', failed: '❌', pending: '⏭️', skipped: '⏭️', todo: '📝' };

// What each file covers, in the order the report lists them.
const FILES = {
  'api.test.js': 'API layer — the one place that calls the backend',
  'auth.test.jsx': 'Login / Register, AuthContext, ProtectedRoute, logout',
  'dashboard.test.jsx': 'Dashboard — GET /api/jobs',
  'createJob.test.jsx': 'Create Job — POST /api/jobs',
  'jobCandidates.test.jsx': 'Job Candidates — list, async states, filters',
  'candidateDetail.test.jsx': 'Candidate Detail — GET /api/evaluations/:id',
  'validation.test.js': 'Client validation mirrors the backend guards',
  'format.test.js': 'Display helpers and the verdict sentence',
  'e2e.test.jsx': 'End to end — sign-up to a candidate result',
};

fs.mkdirSync(REPORTS_DIR, { recursive: true });
const vitest = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const run = spawnSync(process.execPath, [vitest, 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${JSON_OUT}`], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (!fs.existsSync(JSON_OUT)) throw new Error('Vitest produced no JSON output - the run did not complete.');
const result = JSON.parse(fs.readFileSync(JSON_OUT, 'utf8'));

const suites = [...result.testResults].sort(
  (a, b) => Object.keys(FILES).indexOf(path.basename(a.name)) - Object.keys(FILES).indexOf(path.basename(b.name))
);
const all = suites.flatMap((s) => s.assertionResults);
const passed = all.filter((t) => t.status === 'passed').length;
const failed = all.filter((t) => t.status === 'failed').length;

const lines = [
  '# Phase 6 — Test Report',
  '',
  '> Frontend (React) — every screen renders and calls the right door; loading / empty / error / processing states; login + protected-route redirect; create-job validation mirrors the backend; results end to end (backend mocked at fetch).',
  '',
  '| | |',
  '|---|---|',
  `| **Result** | ${failed === 0 ? '✅ ALL PASSED' : `❌ ${failed} FAILED`} |`,
  `| **Tests** | ${passed} passed / ${all.length} total |`,
  `| **Test files** | ${suites.length} (\`frontend/tests/\`) |`,
  '| **Runner** | Vitest + React Testing Library (jsdom) |',
  `| **Run at** | ${new Date().toISOString()} |`,
  '',
  '| File | Covers | Tests |',
  '|---|---|---|',
  ...suites.map((s) => {
    const name = path.basename(s.name);
    const ok = s.assertionResults.filter((t) => t.status === 'passed').length;
    return `| \`${name}\` | ${FILES[name] || '-'} | ${ok}/${s.assertionResults.length} |`;
  }),
  '',
  '---',
  '',
];

let n = 0;
for (const suite of suites) {
  const groups = new Map();
  for (const t of suite.assertionResults) {
    const key = t.ancestorTitles.join(' › ') || path.basename(suite.name);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  for (const [group, tests] of groups) {
    const groupFailed = tests.filter((t) => t.status === 'failed').length;
    lines.push(`## ${group}`, '');
    lines.push(`${tests.length - groupFailed}/${tests.length} passed${groupFailed ? ` — **${groupFailed} failed**` : ''}`, '');
    lines.push('| # | Test | Result |', '|---|---|---|');
    for (const t of tests) {
      n += 1;
      lines.push(`| ${n} | ${t.title.replace(/\|/g, '\\|')} | ${ICON[t.status] || t.status} |`);
    }
    lines.push('');
    for (const t of tests.filter((x) => x.status === 'failed')) {
      lines.push(`### ❌ ${t.title}`, '', '```', (t.failureMessages || []).join('\n').slice(0, 4000), '```', '');
    }
  }
}

fs.writeFileSync(path.join(REPORTS_DIR, 'phase-6.md'), `${lines.join('\n')}\n`, 'utf8');
console.log(`[report] phase-6.md — ${passed}/${all.length} passed`);
process.exit(run.status ?? 1);
