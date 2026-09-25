// Skeleton placeholders shown while a GET is in flight (design 10-dashboard-loading).

export function JobCardSkeleton() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="skeleton" style={{ width: '55%', height: 14 }} />
      <div className="skeleton" style={{ width: '34%', height: 10, marginTop: 14 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <div className="skeleton" style={{ width: 74, height: 22 }} />
        <div className="skeleton" style={{ width: 58, height: 22 }} />
      </div>
    </div>
  );
}

/** Generic block skeleton for the other screens. */
export default function Loader({ label = 'Loading…', rows = 3 }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="card card-pad" aria-hidden="true">
        <div className="skeleton" style={{ width: '40%', height: 18 }} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton" style={{ width: `${85 - i * 12}%`, height: 12, marginTop: 16 }} />
        ))}
      </div>
    </div>
  );
}
