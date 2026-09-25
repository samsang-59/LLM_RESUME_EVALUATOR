import { describe, expect, test } from 'vitest';
import { formatDate, formatDateTime, formatPercent, formatYears, initials, verdictExplanation } from '../src/utils/format';
import { ELIGIBLE, FAILED, JOB, PROCESSING, REJECTED } from './helpers';

describe('Phase 6 - display helpers', () => {
  test('backend timestamps (UTC, no zone) are read as UTC', () => {
    expect(formatDate('2026-08-12 23:30:00')).toMatch(/Aug 2026/);
    expect(formatDateTime('2026-08-14 09:12:00')).toMatch(/2026, \d\d:\d\d$/);
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  test('percent and years', () => {
    expect(formatPercent(87.5)).toBe('88%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('—');
    expect(formatYears(4)).toBe('4');
    expect(formatYears(1.5)).toBe('1.5');
    expect(formatYears(null)).toBe('—');
  });

  test('initials from the name, else the email', () => {
    expect(initials('Priya Raman')).toBe('PR');
    expect(initials('', 'priya@northwind.hr')).toBe('PR');
    expect(initials('', 'john.doe@x.com')).toBe('JD');
  });
});

describe('Phase 6 - the verdict sentence follows the backend gates', () => {
  test('eligible in strict mode: passed both gates', () => {
    expect(verdictExplanation(ELIGIBLE, JOB)).toBe(
      'Passed both gates: no must-have missing, and 92% is at or above the 70% cutoff.'
    );
  });

  test('eligible in soft mode: only the score gate applies', () => {
    expect(verdictExplanation(ELIGIBLE, { ...JOB, matchingMode: 'soft' })).toMatch(/^Passed the score gate/);
  });

  test('strict rejection with missing skills names them', () => {
    expect(verdictExplanation(REJECTED, JOB)).toBe(
      'Failed the skill gate — Express, REST API design missing under strict matching.'
    );
  });

  test('rejection with nothing missing is the score gate', () => {
    const lowScore = { ...ELIGIBLE, eligible: false, overallPercentage: 55 };
    expect(verdictExplanation(lowScore, JOB)).toBe('Failed the score gate — 55% is below the 70% cutoff.');
  });

  test('soft mode never blames the skill gate', () => {
    expect(verdictExplanation(REJECTED, { ...JOB, matchingMode: 'soft' })).toMatch(/score gate/);
  });

  test('processing and failed rows have no verdict to explain', () => {
    expect(verdictExplanation(PROCESSING, JOB)).toMatch(/Still evaluating/);
    expect(verdictExplanation(FAILED, JOB)).toBe('No score — the pipeline could not read this resume.');
  });

  test('without the job (its read failed) it still says something true', () => {
    expect(verdictExplanation(ELIGIBLE, null)).toBe('Passed every gate.');
  });
});
