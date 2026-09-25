import { useId, useState } from 'react';
import Button from './Button';
import SkillTag from './SkillTag';

/**
 * A list of skills built one at a time (design 04-create-job): type, press Enter
 * or Add, remove with ×. Duplicates are ignored case-insensitively, since "node"
 * and "Node" would be the same requirement twice.
 */
export default function SkillInput({ label, hint, skills, onChange, variant = 'required', error }) {
  const [draft, setDraft] = useState('');
  const inputId = useId();

  const add = () => {
    const skill = draft.trim();
    if (skill && !skills.some((s) => s.toLowerCase() === skill.toLowerCase())) onChange([...skills, skill]);
    setDraft('');
  };

  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <div className="skill-input-row">
        <input
          id={inputId}
          className="input"
          placeholder="Type a skill and press Enter"
          value={draft}
          aria-invalid={error ? 'true' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // Enter adds a skill; it must not submit the form
              add();
            }
          }}
        />
        <Button onClick={add} aria-label={`Add ${label.toLowerCase()}`}>
          Add
        </Button>
      </div>
      {skills.length > 0 && (
        <div className="chip-row">
          {skills.map((skill) => (
            <SkillTag
              key={skill}
              skill={skill}
              variant={variant}
              large
              onRemove={() => onChange(skills.filter((s) => s !== skill))}
            />
          ))}
        </div>
      )}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
