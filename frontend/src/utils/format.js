// Display helpers shared by the screens. Pure functions, no React.

// The backend stores timestamps as UTC without a zone marker ("2026-08-12 09:12:00").
// Read them as UTC, or every date would be off by the viewer's offset.
function toDate(value) {
  if (!value) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** "12 Aug 2026", in the viewer's time zone. */
export function formatDate(value) {
  const date = toDate(value);
  return date ? `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}` : '—';
}

/** "14 Aug 2026, 09:12" */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return `${formatDate(value)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 87.5 -> "88%"; null -> "—" */
export function formatPercent(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value)}%`;
}

/** 4 -> "4", 1.5 -> "1.5", null -> "—" */
export function formatYears(value) {
  if (value === null || value === undefined) return '—';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

/** "Priya Raman" -> "PR"; falls back to the email's first letters. */
export function initials(name, email = '') {
  const source = (name || '').trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function plural(count, one, many = `${one}s`) {
  return count === 1 ? one : many;
}

/** Friendly copy for each failure reason the pipeline can record (backend utils/errors.js). */
export const FAILURE_MESSAGES = {
  unreadable_resume: 'No score was produced. Ask the source system to resubmit a readable file.',
  network: 'The LLM provider could not be reached. The source system can resubmit this resume.',
  llm_overloaded: 'The LLM provider was overloaded and every retry failed. Resubmitting later should work.',
  malformed_output: 'The LLM returned an answer we could not use, so no score was trusted.',
  internal_error: 'Something went wrong on our side while scoring this resume.',
};

export const FAILURE_SHORT = {
  unreadable_resume: 'the pipeline could not read this resume.',
  network: 'the LLM provider could not be reached.',
  llm_overloaded: 'the LLM provider was overloaded.',
  malformed_output: 'the LLM answer could not be used.',
  internal_error: 'an internal error stopped the run.',
};

/**
 * Why a candidate passed or failed - the same two gates the backend applies
 * (scoringService): strict mode needs every must-have, and both modes need the cutoff.
 */
export function verdictExplanation(evaluation, job) {
  const { status, eligible, overallPercentage, missingSkills = [], failureReason } = evaluation;
  const cutoff = job?.cutoffPercentage;
  const mode = job?.matchingMode;
  const pct = formatPercent(overallPercentage);

  if (status === 'processing') return 'Still evaluating — the score appears here when the pipeline finishes.';
  if (status === 'failed') return `No score — ${FAILURE_SHORT[failureReason] || 'the run failed.'}`;
  if (cutoff === undefined) return eligible ? 'Passed every gate.' : 'Did not pass every gate.';

  if (eligible) {
    return mode === 'strict'
      ? `Passed both gates: no must-have missing, and ${pct} is at or above the ${cutoff}% cutoff.`
      : `Passed the score gate: ${pct} is at or above the ${cutoff}% cutoff.`;
  }
  if (mode === 'strict' && missingSkills?.length) {
    return `Failed the skill gate — ${missingSkills.join(', ')} missing under strict matching.`;
  }
  return `Failed the score gate — ${pct} is below the ${cutoff}% cutoff.`;
}
