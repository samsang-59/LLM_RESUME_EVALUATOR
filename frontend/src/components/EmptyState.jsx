/** "Nothing here yet" card - e.g. no jobs, or a job nobody has applied to. */
export default function EmptyState({ title, message, action }) {
  return (
    <div className="card state-card">
      <h3 className="state-title">{title}</h3>
      {message && <p className="state-message">{message}</p>}
      {action}
    </div>
  );
}
