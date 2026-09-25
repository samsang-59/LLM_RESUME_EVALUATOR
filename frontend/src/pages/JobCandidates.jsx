import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getJobById, getJobCandidates } from '../api';
import useLoad from '../api/useLoad';
import BackButton from '../components/BackButton';
import Button from '../components/Button';
import CandidateRow from '../components/CandidateRow';
import ErrorState from '../components/ErrorState';
import Loader from '../components/Loader';
import { ModeChip } from '../components/StatusBadge';
import { formatYears } from '../utils/format';

const NO_FILTERS = { eligible: false, minPercentage: 0, minExperience: 0 };
const FILTER_DELAY_MS = 300; // wait for the slider to settle before asking the backend

const isFiltered = (f) => f.eligible || f.minPercentage > 0 || f.minExperience > 0;

function countStats(evaluations) {
  return {
    evaluated: evaluations.length,
    eligible: evaluations.filter((e) => e.eligible === true).length,
    processing: evaluations.filter((e) => e.status === 'processing').length,
    failed: evaluations.filter((e) => e.status === 'failed').length,
  };
}

/**
 * /jobs/:jobId/candidates - GET /api/jobs/:jobId + GET /api/jobs/:jobId/evaluations
 * (designs 05, 06-filtered, 11-empty, 13-dark).
 *
 * The page loads the job and EVERY candidate once; that full list drives the stats
 * card, so the totals stay put while HR narrows the table. Filters are applied by
 * the backend (doc 07) with a second request - they only ever narrow.
 */
export default function JobCandidates() {
  const { jobId } = useParams();
  const page = useLoad(() => Promise.all([getJobById(jobId), getJobCandidates(jobId)]), [jobId]);

  const [filters, setFilters] = useState(NO_FILTERS);
  const [applied, setApplied] = useState(NO_FILTERS);
  // rows: null until the first filtered answer arrives - until then (and while a new
  // one loads) the table keeps showing what it showed before, instead of blanking.
  const [filtered, setFiltered] = useState({ status: 'idle', rows: null, error: null });

  // Debounce: a slider fires on every step; only the value it stops at is sent.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), FILTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (!isFiltered(applied)) {
      setFiltered({ status: 'idle', rows: null, error: null });
      return undefined;
    }
    let current = true;
    setFiltered((f) => ({ ...f, status: 'loading', error: null }));
    getJobCandidates(jobId, applied).then(
      (rows) => current && setFiltered({ status: 'ready', rows, error: null }),
      (error) => current && setFiltered({ status: 'error', rows: null, error })
    );
    return () => {
      current = false;
    };
  }, [jobId, applied]);

  if (page.status === 'loading') {
    return (
      <main className="page">
        <BackButton to="/dashboard">Jobs</BackButton>
        <Loader label="Loading candidates…" rows={5} />
      </main>
    );
  }

  if (page.status === 'error') {
    const notFound = page.error?.status === 404;
    return (
      <main className="page">
        <BackButton to="/dashboard">Jobs</BackButton>
        <ErrorState
          title={notFound ? 'Job not found' : 'Could not load this job'}
          message={
            notFound
              ? 'There is no job with this id. It may have been removed, or the link is wrong.'
              : `The request to GET /api/jobs/${jobId}/evaluations failed. Check your connection and try again.`
          }
          onRetry={notFound ? undefined : page.reload}
        />
      </main>
    );
  }

  const [job, allCandidates] = page.data;
  const stats = countStats(allCandidates);
  const filtering = isFiltered(applied);
  const rows = filtering && filtered.rows ? filtered.rows : allCandidates;

  let tableBody;
  if (filtering && filtered.status === 'error') {
    tableBody = (
      <EmptyRow title="Could not apply the filters" message={filtered.error.message}>
        <Button small onClick={() => setApplied({ ...applied })}>
          Retry
        </Button>
      </EmptyRow>
    );
  } else if (allCandidates.length === 0) {
    tableBody = (
      <EmptyRow
        title="No candidates yet"
        message="Once your ATS submits resumes under this job, every evaluation shows up here — including the near-misses."
      />
    );
  } else if (rows.length === 0) {
    tableBody = (
      <EmptyRow
        title="No candidates match these filters"
        message="Filters only narrow the list. Loosen one, or reset them to see everyone again."
      >
        <Button small onClick={() => setFilters(NO_FILTERS)}>
          Reset filters
        </Button>
      </EmptyRow>
    );
  } else {
    tableBody = rows.map((evaluation) => (
      <CandidateRow
        key={evaluation.id}
        evaluation={evaluation}
        requiredExperienceYears={job.requiredExperienceYears}
      />
    ));
  }

  return (
    <main className="page">
      <BackButton to="/dashboard">Jobs</BackButton>
      <h1 className="page-title">{job.title}</h1>
      <div className="job-meta">
        <ModeChip mode={job.matchingMode} />
        <span className="chip">cutoff {job.cutoffPercentage}%</span>
        <span className="chip">{formatYears(job.requiredExperienceYears)}+ yrs required</span>
        <span className="job-meta-skills">Must-have: {job.mustHaveSkills.join(', ')}</span>
      </div>

      <div className="card stats" aria-label="Candidate totals">
        <div className="stat">
          <strong>{stats.evaluated}</strong>
          <span>evaluated</span>
        </div>
        <div className="stat stat-eligible">
          <strong>{stats.eligible}</strong>
          <span>eligible</span>
        </div>
        <div className="stat stat-processing">
          <strong>{stats.processing}</strong>
          <span>processing</span>
        </div>
        <div className="stat stat-failed">
          <strong>{stats.failed}</strong>
          <span>failed</span>
        </div>
      </div>

      <div className="card filters" role="group" aria-label="Filters">
        <span className="filters-label">Filters</span>
        <button
          type="button"
          className="btn btn-sm toggle"
          aria-pressed={filters.eligible}
          onClick={() => setFilters({ ...filters, eligible: !filters.eligible })}
        >
          Eligible only
        </button>
        <label className="range">
          Min score
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={filters.minPercentage}
            onChange={(e) => setFilters({ ...filters, minPercentage: Number(e.target.value) })}
          />
          <output>{filters.minPercentage}%</output>
        </label>
        <label className="range">
          Min experience
          <input
            type="range"
            min="0"
            max="15"
            step="1"
            value={filters.minExperience}
            onChange={(e) => setFilters({ ...filters, minExperience: Number(e.target.value) })}
          />
          <output>{filters.minExperience} yr</output>
        </label>
        <Button small className="btn-reset" disabled={!isFiltered(filters)} onClick={() => setFilters(NO_FILTERS)}>
          Reset
        </Button>
      </div>

      <div className="card table-card">
        <table className="table" aria-busy={filtering && filtered.status === 'loading'}>
          <thead>
            <tr>
              <th scope="col">Score</th>
              <th scope="col">Candidate</th>
              <th scope="col">Verdict</th>
              <th scope="col">Status</th>
              <th scope="col">Skills</th>
              <th scope="col" className="num">
                Experience
              </th>
            </tr>
          </thead>
          <tbody>{tableBody}</tbody>
        </table>
      </div>
    </main>
  );
}

function EmptyRow({ title, message, children }) {
  return (
    <tr>
      <td colSpan={6} className="table-empty">
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        {children && <div style={{ marginTop: 16 }}>{children}</div>}
      </td>
    </tr>
  );
}
