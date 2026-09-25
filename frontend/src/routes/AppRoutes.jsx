import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout';
import EmptyState from '../components/EmptyState';
import CandidateDetail from '../pages/CandidateDetail';
import CreateJob from '../pages/CreateJob';
import Dashboard from '../pages/Dashboard';
import JobCandidates from '../pages/JobCandidates';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ProtectedRoute, { PublicOnlyRoute } from './ProtectedRoute';

/**
 * Frontend routes show pages; they never call the backend themselves (doc 10).
 * The page's own load or submit event does that, through the API layer.
 */
export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/jobs/new" element={<CreateJob />} />
          <Route path="/jobs/:jobId/candidates" element={<JobCandidates />} />
          <Route path="/evaluations/:evaluationId" element={<CandidateDetail />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <main className="page">
      <EmptyState
        title="Page not found"
        message="There is nothing at this address."
        action={
          <Link to="/dashboard" className="btn">
            Back to jobs
          </Link>
        }
      />
    </main>
  );
}
