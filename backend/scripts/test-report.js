// Runs the test suite and writes ONE markdown report per phase into tests/reports/.
//
// The reports are generated from Jest's own JSON output, never hand-written, so a
// report can never drift from what the tests actually did.
//
//   npm run test:report              -> every phase
//   npm run test:report -- phase1    -> just that phase's file
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT, 'tests', 'reports');
const JSON_OUT = path.join(REPORTS_DIR, '.last-run.json');

// What each phase covers, for the report header (from docs/design/11-phase-plan.md).
const PHASE_TITLES = {
  0: 'Setup — Express skeleton, config/env, DB helper, health check',
  1: 'Schema / DB — migrations for users, jobs, resumes, evaluations',
  2: 'Jobs — first full vertical slice (router → validator → controller → service → repository)',
  3: 'Evaluation pipeline — async + webhook',
  4: 'Results + filters',
  5: 'Auth — register / login, JWT + API key guards',
  6: 'Frontend (React)',
  7: 'Hardening',
};

const ICON = { passed: '✅', failed: '❌', pending: '⏭️', skipped: '⏭️', todo: '📝' };

function runJest(filter) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const args = [
    '--disable-warning=ExperimentalWarning',
    path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js'),
    '--runInBand',
    '--json',
    `--outputFile=${JSON_OUT}`,
  ];
  if (filter) args.push(filter);

  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (!fs.existsSync(JSON_OUT)) {
    throw new Error('Jest produced no JSON output - the run did not complete.');
  }
  return { report: JSON.parse(fs.readFileSync(JSON_OUT, 'utf8')), exitCode: result.status };
}

/** phase0.test.js -> 0 ; anything else -> null */
function phaseOf(filePath) {
  const match = path.basename(filePath).match(/^phase(\d+)\.test\.js$/);
  return match ? Number(match[1]) : null;
}

function writePhaseReport(phase, suite) {
  const total = suite.assertionResults.length;
  const passed = suite.assertionResults.filter((a) => a.status === 'passed').length;
  const failed = suite.assertionResults.filter((a) => a.status === 'failed').length;
  const durationMs = (suite.endTime || 0) - (suite.startTime || 0);

  const lines = [];
  lines.push(`# Phase ${phase} — Test Report`);
  lines.push('');
  if (PHASE_TITLES[phase]) lines.push(`> ${PHASE_TITLES[phase]}`);
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| **Result** | ${failed === 0 ? '✅ ALL PASSED' : `❌ ${failed} FAILED`} |`);
  lines.push(`| **Tests** | ${passed} passed / ${total} total |`);
  lines.push(`| **Duration** | ${(durationMs / 1000).toFixed(2)}s |`);
  lines.push(`| **Test file** | \`tests/${path.basename(suite.name)}\` |`);
  lines.push(`| **Run at** | ${new Date().toISOString()} |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Group by describe() block, preserving the order they ran in.
  const groups = new Map();
  for (const a of suite.assertionResults) {
    const key = a.ancestorTitles.join(' › ') || '(ungrouped)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  let n = 0;
  for (const [group, tests] of groups) {
    const groupFailed = tests.filter((t) => t.status === 'failed').length;
    lines.push(`## ${group}`);
    lines.push('');
    lines.push(
      `${tests.filter((t) => t.status === 'passed').length}/${tests.length} passed` +
        (groupFailed ? ` — **${groupFailed} failed**` : '')
    );
    lines.push('');
    lines.push('| # | Test | Result |');
    lines.push('|---|---|---|');
    for (const t of tests) {
      n += 1;
      lines.push(`| ${n} | ${t.title.replace(/\|/g, '\\|')} | ${ICON[t.status] || t.status} |`);
    }
    lines.push('');

    for (const t of tests.filter((x) => x.status === 'failed')) {
      lines.push(`### ❌ ${t.title}`);
      lines.push('');
      lines.push('```');
      lines.push((t.failureMessages || []).join('\n').slice(0, 4000));
      lines.push('```');
      lines.push('');
    }
  }

  const file = path.join(REPORTS_DIR, `phase-${phase}.md`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return { file, total, passed, failed };
}

function writeIndex(summaries) {
  const lines = [];
  lines.push('# Test Reports');
  lines.push('');
  lines.push('One report per phase, regenerated from Jest output by `npm run test:report`.');
  lines.push('');
  lines.push('| Phase | Covers | Tests | Result | Report |');
  lines.push('|---|---|---|---|---|');
  for (const s of summaries.sort((a, b) => a.phase - b.phase)) {
    lines.push(
      `| ${s.phase} | ${PHASE_TITLES[s.phase] || '-'} | ${s.passed}/${s.total} | ` +
        `${s.failed === 0 ? '✅ passed' : `❌ ${s.failed} failed`} | [phase-${s.phase}.md](phase-${s.phase}.md) |`
    );
  }
  const totals = summaries.reduce(
    (acc, s) => ({ total: acc.total + s.total, passed: acc.passed + s.passed, failed: acc.failed + s.failed }),
    { total: 0, passed: 0, failed: 0 }
  );
  lines.push(`| **All** | | **${totals.passed}/${totals.total}** | ${totals.failed === 0 ? '✅' : '❌'} | |`);
  lines.push('');
  lines.push(`_Last run: ${new Date().toISOString()}_`);
  fs.writeFileSync(path.join(REPORTS_DIR, 'README.md'), `${lines.join('\n')}\n`, 'utf8');
}

(function main() {
  const filter = process.argv[2];
  const { report, exitCode } = runJest(filter);

  const summaries = [];
  for (const suite of report.testResults) {
    const phase = phaseOf(suite.name);
    if (phase === null) continue; // helpers and any non-phase suite
    const written = writePhaseReport(phase, suite);
    summaries.push({ phase, ...written });
    console.log(
      `[report] phase-${phase}.md — ${written.passed}/${written.total} passed` +
        (written.failed ? ` (${written.failed} FAILED)` : '')
    );
  }

  // The index is only rewritten on a full run, so a filtered run cannot drop phases from it.
  if (!filter && summaries.length) writeIndex(summaries);
  fs.rmSync(JSON_OUT, { force: true });
  process.exitCode = exitCode === 0 ? 0 : 1;
})();
