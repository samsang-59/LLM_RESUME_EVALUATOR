/**
 * One skill chip. The variant is its meaning: a job's required skill, or a
 * candidate's matched / missing / extra skill.
 * @param {'required'|'matched'|'missing'|'extra'} [variant]
 * @param {() => void} [onRemove]  shows an × (the create-job form)
 */
export default function SkillTag({ skill, variant = 'required', large, onRemove }) {
  return (
    <span className={`skill-tag skill-${variant}${large ? ' skill-tag-lg' : ''}`}>
      {skill}
      {onRemove && (
        <button type="button" className="skill-remove" onClick={onRemove} aria-label={`Remove ${skill}`}>
          ×
        </button>
      )}
    </span>
  );
}
