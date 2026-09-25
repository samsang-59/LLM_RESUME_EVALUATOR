// The score dial. Colour follows the score band from the designs: green for a
// strong match, blue for a good one, amber below 70. A missing score (processing
// or failed) draws an empty track - failed adds the red marker from the design.

function colorFor(value) {
  if (value >= 90) return 'var(--green)';
  if (value >= 70) return 'var(--primary)';
  return 'var(--amber)';
}

/**
 * @param {number|null} value  0-100, or null when there is no score
 * @param {'sm'|'lg'} [size]
 * @param {'processing'|'failed'} [state]  only used when value is null
 */
export default function CircularPercentage({ value, size = 'sm', state, caption }) {
  const px = size === 'lg' ? 150 : 42;
  const stroke = size === 'lg' ? 12 : 4;
  const radius = (px - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasScore = value !== null && value !== undefined;
  const clamped = hasScore ? Math.max(0, Math.min(100, value)) : 0;

  let label = 'No score';
  if (hasScore) label = `${Math.round(clamped)}% match`;
  else if (state === 'processing') label = 'Score pending';

  let text = '—';
  if (hasScore) text = `${Math.round(clamped)}%`;
  else if (state === 'processing') text = '…';

  return (
    <div className={`dial dial-${size}`} style={{ width: px, height: px }} role="img" aria-label={label}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden="true">
        <circle
          cx={px / 2}
          cy={px / 2}
          r={radius}
          fill="none"
          stroke="var(--ring-track)"
          strokeWidth={stroke}
          strokeDasharray={state === 'processing' && !hasScore ? `${stroke} ${stroke * 1.5}` : undefined}
        />
        {hasScore && (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={radius}
            fill="none"
            stroke={colorFor(clamped)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
          />
        )}
        {!hasScore && state === 'failed' && (
          <circle cx={px - stroke / 2} cy={px / 2} r={stroke / 1.5 + 1} fill="var(--red)" />
        )}
      </svg>
      <span className="dial-value" aria-hidden="true">
        {text}
        {caption && <span className="dial-caption">{caption}</span>}
      </span>
    </div>
  );
}
