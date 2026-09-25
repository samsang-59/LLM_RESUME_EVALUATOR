import { useNavigate } from 'react-router-dom';
import CircularPercentage from './CircularPercentage';
import { StatusBadge, VerdictBadge } from './StatusBadge';
import { formatYears } from '../utils/format';

/** The candidate's name, or what we can honestly say when extraction never ran. */
export function candidateLabel(evaluation) {
  if (evaluation.candidate?.name) return { text: evaluation.candidate.name, known: true };
  if (evaluation.status === 'processing') return { text: 'Evaluating…', known: false };
  return { text: 'Unknown candidate', known: false };
}

/**
 * One evaluation in the Job Candidates table (design 05-job-candidates). Handles all
 * three async states: processing (no score yet), completed, and failed (the reason
 * shows where the skills summary would be).
 */
export default function CandidateRow({ evaluation, requiredExperienceYears }) {
  const navigate = useNavigate();
  const { status, overallPercentage, eligible, candidate } = evaluation;
  const name = candidateLabel(evaluation);
  const open = () => navigate(`/evaluations/${evaluation.id}`);

  let skills;
  if (status === 'failed') {
    skills = <span className="failure-inline">{evaluation.failureReason}</span>;
  } else if (status === 'processing') {
    skills = <span className="muted">—</span>;
  } else {
    const matched = evaluation.matchedRequiredSkills?.length ?? 0;
    const missing = evaluation.missingSkills?.length ?? 0;
    const extra = evaluation.extraSkills?.length ?? 0;
    skills = `${matched} matched · ${missing} missing · ${extra} extra`;
  }

  const required = evaluation.requiredExperienceYears ?? requiredExperienceYears;

  return (
    <tr
      className="candidate-row"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`Open ${name.text}`}
    >
      <td>
        <CircularPercentage value={overallPercentage} state={status} />
      </td>
      <td>
        <div className={`candidate-name${name.known ? '' : ' pending'}`}>{name.text}</div>
        {candidate?.email && <div className="candidate-email">{candidate.email}</div>}
      </td>
      <td>
        <VerdictBadge eligible={eligible} />
      </td>
      <td>
        <StatusBadge status={status} />
      </td>
      <td className="skills-summary">{skills}</td>
      <td className="num">
        {formatYears(evaluation.candidateExperienceYears)} / {formatYears(required)} yr
      </td>
    </tr>
  );
}
