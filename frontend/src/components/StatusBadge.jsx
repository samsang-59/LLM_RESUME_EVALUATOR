/**
 * The two badges an evaluation carries:
 *   verdict - eligible / rejected, or "pending" while there is no result
 *   status  - processing / completed / failed (the async lifecycle)
 */
export function VerdictBadge({ eligible }) {
  if (eligible === true) return <span className="badge badge-eligible">Eligible</span>;
  if (eligible === false) return <span className="badge badge-rejected">Rejected</span>;
  return <span className="badge badge-pending">pending</span>;
}

export function StatusBadge({ status }) {
  const variant = { processing: 'badge-processing', failed: 'badge-failed' }[status] || '';
  return <span className={`badge ${variant}`.trim()}>{status}</span>;
}

/** The job's matching-mode chip: strict (blue) or soft (amber). */
export function ModeChip({ mode }) {
  return <span className={`chip chip-${mode}`}>{mode} matching</span>;
}
