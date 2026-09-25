import { Link } from 'react-router-dom';
import { getJobs } from '../api';
import useLoad from '../api/useLoad';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import JobCard from '../components/JobCard';
import { JobCardSkeleton } from '../components/Loader';

/** /dashboard - GET /api/jobs (designs 03, 10-loading, 12-error; empty state added in the same style). */
export default function Dashboard() {
  const { status, data: jobs, reload } = useLoad(getJobs, []);

  let body;
  if (status === 'loading') {
    body = (
      <div className="job-grid" role="status" aria-label="Loading jobs">
        {Array.from({ length: 5 }, (_, i) => (
          <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (status === 'error') {
    body = (
      <ErrorState
        title="Could not load your jobs"
        message="The request to GET /api/jobs failed. Check your connection and try again."
        onRetry={reload}
      />
    );
  } else if (jobs.length === 0) {
    body = (
      <EmptyState
        title="No jobs yet"
        message="Create your first job. Your ATS can start submitting candidates against it as soon as it exists."
        action={
          <Link to="/jobs/new" className="btn btn-primary">
            Create job
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="job-grid">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    );
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">Every opening your ATS can submit candidates against.</p>
        </div>
        <Link to="/jobs/new" className="btn btn-primary">
          Create job
        </Link>
      </div>
      {body}
    </main>
  );
}
