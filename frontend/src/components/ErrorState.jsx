import Button from './Button';

/** A failed GET (design 12-dashboard-error): what failed, and a Retry. */
export default function ErrorState({ title, message, onRetry }) {
  return (
    <div className="card state-card state-card-error" role="alert">
      <div className="state-icon" aria-hidden="true">
        !
      </div>
      <h3 className="state-title">{title}</h3>
      <p className="state-message">{message}</p>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}
