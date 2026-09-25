import { useId } from 'react';

/**
 * A labelled input with an optional hint (top right), help text (below) and error.
 * The error replaces the help text, and marks the input aria-invalid.
 */
export default function InputField({ label, hint, help, error, id, ...inputProps }) {
  const autoId = useId();
  const inputId = id || autoId;
  const messageId = `${inputId}-message`;
  const message = error || help;

  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <input
        id={inputId}
        className="input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={message ? messageId : undefined}
        {...inputProps}
      />
      {message && (
        <span id={messageId} className={error ? 'field-error' : 'field-help'} role={error ? 'alert' : undefined}>
          {message}
        </span>
      )}
    </div>
  );
}
