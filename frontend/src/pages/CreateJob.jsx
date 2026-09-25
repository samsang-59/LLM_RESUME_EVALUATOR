import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createJob } from '../api';
import BackButton from '../components/BackButton';
import Button from '../components/Button';
import InputField from '../components/InputField';
import SkillInput from '../components/SkillInput';
import { detailsToErrors, validateJob } from '../utils/validation';

const MODES = [
  { value: 'strict', title: 'Strict', description: 'Every must-have is required' },
  { value: 'soft', title: 'Soft', description: 'Missing must-haves lower the score' },
];

/**
 * /jobs/new - POST /api/jobs (design 04-create-job; the lower half - experience,
 * mode, cutoff, actions - completed in the same style).
 */
export default function CreateJob() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    mustHaveSkills: [],
    goodToHaveSkills: [],
    requiredExperienceYears: '',
    matchingMode: 'strict',
    cutoffPercentage: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateJob(form);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await createJob({
        title: form.title.trim(),
        mustHaveSkills: form.mustHaveSkills,
        goodToHaveSkills: form.goodToHaveSkills,
        requiredExperienceYears:
          String(form.requiredExperienceYears).trim() === '' ? 0 : Number(form.requiredExperienceYears),
        matchingMode: form.matchingMode,
        cutoffPercentage: Number(form.cutoffPercentage),
      });
      navigate('/dashboard');
    } catch (err) {
      // The backend is the real guard: anything our mirror missed comes back as a
      // 400 with per-field details, shown under the same fields.
      if (err.status === 400 && err.details) setErrors(detailsToErrors(err.details));
      else setFormError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="page page-narrow">
      <BackButton to="/dashboard">Jobs</BackButton>
      <div className="page-header">
        <div>
          <h1 className="page-title">Create job</h1>
          <p className="page-subtitle">These requirements are what every resume submitted under this job is scored against.</p>
        </div>
      </div>

      <form className="card card-pad" onSubmit={handleSubmit} noValidate>
        {formError && (
          <div className="form-alert" role="alert">
            {formError}
          </div>
        )}
        <InputField
          label="Job title"
          placeholder="e.g. Platform Engineer"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
        />
        <SkillInput
          label="Must-have skills"
          hint="at least one required"
          skills={form.mustHaveSkills}
          onChange={(skills) => set('mustHaveSkills', skills)}
          error={errors.mustHaveSkills}
        />
        <SkillInput
          label="Good-to-have skills"
          hint="optional · used as a tiebreaker"
          variant="extra"
          skills={form.goodToHaveSkills}
          onChange={(skills) => set('goodToHaveSkills', skills)}
          error={errors.goodToHaveSkills}
        />

        <div className="form-grid">
          <InputField
            label="Required experience"
            hint="years · decimals allowed"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            placeholder="0"
            value={form.requiredExperienceYears}
            onChange={(e) => set('requiredExperienceYears', e.target.value)}
            error={errors.requiredExperienceYears}
            help="Leave empty for no minimum."
          />
          <InputField
            label="Cutoff %"
            hint="0–100"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            placeholder="70"
            value={form.cutoffPercentage}
            onChange={(e) => set('cutoffPercentage', e.target.value)}
            error={errors.cutoffPercentage}
            help="Candidates below this score are rejected."
          />
        </div>

        <div className="field">
          <div className="field-label-row">
            <span className="field-label" id="mode-label">
              Matching mode
            </span>
          </div>
          <div className="mode-options" role="radiogroup" aria-labelledby="mode-label">
            {MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                role="radio"
                aria-checked={form.matchingMode === mode.value}
                className="mode-option"
                onClick={() => set('matchingMode', mode.value)}
              >
                <strong>{mode.title}</strong>
                <span>{mode.description}</span>
              </button>
            ))}
          </div>
          {errors.matchingMode && (
            <span className="field-error" role="alert">
              {errors.matchingMode}
            </span>
          )}
        </div>

        <div className="form-actions">
          <Button onClick={() => navigate('/dashboard')}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create job'}
          </Button>
        </div>
      </form>
    </main>
  );
}
