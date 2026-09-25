import { Link } from 'react-router-dom';
import { ModeChip } from './StatusBadge';
import SkillTag from './SkillTag';
import { formatDate, formatYears, plural } from '../utils/format';

/** One job on the dashboard (design 03-dashboard). The whole card links to its candidates. */
export default function JobCard({ job }) {
  const count = job.candidateCount ?? 0;

  return (
    <Link to={`/jobs/${job.id}/candidates`} className="card job-card">
      <div className="job-card-head">
        <div>
          <h3 className="job-card-title">{job.title}</h3>
          <div className="job-card-date">Created {formatDate(job.createdAt)}</div>
        </div>
        <div className="job-card-count">
          <strong>{count}</strong>
          <span>{plural(count, 'candidate')}</span>
        </div>
      </div>
      <hr className="divider" />
      <div className="chip-row">
        <ModeChip mode={job.matchingMode} />
        <span className="chip">cutoff {job.cutoffPercentage}%</span>
        <span className="chip">{formatYears(job.requiredExperienceYears)}+ yrs</span>
      </div>
      <div className="chip-row">
        {job.mustHaveSkills.map((skill) => (
          <SkillTag key={skill} skill={skill} />
        ))}
      </div>
    </Link>
  );
}
