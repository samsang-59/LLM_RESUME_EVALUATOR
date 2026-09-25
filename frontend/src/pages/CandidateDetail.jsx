import { useParams } from 'react-router-dom';
import { getEvaluationById, getJobById } from '../api';
import useLoad from '../api/useLoad';
import BackButton from '../components/BackButton';
import CircularPercentage from '../components/CircularPercentage';
import ErrorState from '../components/ErrorState';
import Loader from '../components/Loader';
import SkillTag from '../components/SkillTag';
import { StatusBadge, VerdictBadge } from '../components/StatusBadge';
import { candidateLabel } from '../components/CandidateRow';
import { FAILURE_MESSAGES, formatDateTime, formatYears, verdictExplanation } from '../utils/format';

/**
 * The evaluation, then its job. The job supplies the back link's title, the mode
 * and the cutoff; if that second read fails the result is still worth showing, so
 * it degrades to "no job details" rather than an error screen.
 */
async function loadDetail(id) {
  const evaluation = await getEvaluationById(id);
  const job = await getJobById(evaluation.jobId).catch(() => null);
  return { evaluation, job };
}

/**
 * /evaluations/:evaluationId - GET /api/evaluations/:id
 * (designs 07-eligible, 08-rejected, 09-failed; processing and dark in the same style).
 */
export default function CandidateDetail() {
  const { evaluationId } = useParams();
  const { status, data, error, reload } = useLoad(() => loadDetail(evaluationId), [evaluationId]);

  if (status === 'loading') {
    return (
      <main className="page">
        <BackButton to="/dashboard">Jobs</BackButton>
        <Loader label="Loading candidate…" rows={6} />
      </main>
    );
  }

  if (status === 'error') {
    const notFound = error?.status === 404;
    return (
      <main className="page">
        <BackButton to="/dashboard">Jobs</BackButton>
        <ErrorState
          title={notFound ? 'Evaluation not found' : 'Could not load this candidate'}
          message={
            notFound
              ? 'There is no evaluation with this id. The link may be wrong.'
              : `The request to GET /api/evaluations/${evaluationId} failed. Check your connection and try again.`
          }
          onRetry={notFound ? undefined : reload}
        />
      </main>
    );
  }

  const { evaluation, job } = data;
  const { candidate } = evaluation;
  const name = candidateLabel(evaluation);
  const completed = evaluation.status === 'completed';
  const matched = evaluation.matchedRequiredSkills || [];
  const missing = evaluation.missingSkills || [];
  const extra = evaluation.extraSkills || [];

  return (
    <main className="page">
      <BackButton to={`/jobs/${evaluation.jobId}/candidates`}>{job ? job.title : 'Candidates'}</BackButton>

      <div className="detail-grid">
        <div className="detail-col">
          <section className="card card-pad">
            <div className="detail-head">
              <h1 className={`detail-name${name.known ? '' : ' muted'}`}>{name.text}</h1>
              <div className="detail-badges">
                <VerdictBadge eligible={evaluation.eligible} />
                <StatusBadge status={evaluation.status} />
              </div>
            </div>
            {(candidate?.email || candidate?.phone) && (
              <div className="detail-contact">
                {candidate.email && <span>{candidate.email}</span>}
                {candidate.phone && <span>{candidate.phone}</span>}
              </div>
            )}
            {evaluation.status === 'failed' && (
              <div className="failure-box" role="alert">
                <h4>Evaluation failed</h4>
                <code>{evaluation.failureReason}</code>
                <p>{FAILURE_MESSAGES[evaluation.failureReason] || 'No score was produced.'}</p>
              </div>
            )}
            {evaluation.status === 'processing' && (
              <p className="experience-note">
                The pipeline is still reading this resume. Refresh in a moment to see the result.
              </p>
            )}
          </section>

          {completed && (
            <section className="card card-pad">
              <h2 className="section-label">Matched must-have skills</h2>
              {matched.length ? (
                <div className="chip-row">
                  {matched.map((skill) => (
                    <SkillTag key={skill} skill={skill} variant="matched" large />
                  ))}
                </div>
              ) : (
                <p className="skills-note">None of the must-have skills were found.</p>
              )}

              {missing.length > 0 && (
                <>
                  <hr className="divider" />
                  <h2 className="section-label">Missing must-have skills</h2>
                  <div className="chip-row">
                    {missing.map((skill) => (
                      <SkillTag key={skill} skill={skill} variant="missing" large />
                    ))}
                  </div>
                </>
              )}

              <hr className="divider" />
              <h2 className="section-label">Extra &amp; good-to-have skills</h2>
              {extra.length ? (
                <div className="chip-row">
                  {extra.map((skill) => (
                    <SkillTag key={skill} skill={skill} variant="extra" large />
                  ))}
                </div>
              ) : (
                <p className="skills-note">No skills beyond the must-haves.</p>
              )}
              <p className="skills-note">Not part of the score — a tiebreaker for HR.</p>

              <hr className="divider" />
              <h2 className="section-label">Experience</h2>
              <div className="experience">
                <div>
                  <strong>{formatYears(evaluation.candidateExperienceYears)} yr</strong>
                  <span>candidate</span>
                </div>
                <div>
                  <strong>{formatYears(evaluation.requiredExperienceYears)} yr</strong>
                  <span>required</span>
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="detail-col">
          <section className="card score-card">
            <CircularPercentage
              value={evaluation.overallPercentage}
              size="lg"
              state={evaluation.status}
              caption="overall match"
            />
            <p className="score-explanation">{verdictExplanation(evaluation, job)}</p>
          </section>

          <section className="card card-pad">
            <h2 className="section-label">Evaluation record</h2>
            <dl className="record">
              <div>
                <dt>ID</dt>
                <dd className="mono">#{evaluation.id}</dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{formatDateTime(evaluation.createdAt)}</dd>
              </div>
              {job && (
                <>
                  <div>
                    <dt>Mode</dt>
                    <dd>{job.matchingMode}</dd>
                  </div>
                  <div>
                    <dt>Cutoff</dt>
                    <dd>{job.cutoffPercentage}%</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Webhook</dt>
                <dd>{evaluation.deliveryStatus}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
