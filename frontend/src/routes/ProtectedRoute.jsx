import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps every HR screen (doc 10): no valid token -> /login. The page they wanted is
 * remembered, so signing in lands them back on it.
 *
 * This is a convenience, not security - the backend's jwtGuard is what actually
 * refuses a request. A user who edits localStorage gets past this wrapper and then
 * gets 401 on every call.
 */
export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/**
 * The reverse, for /login and /register: someone signed in is sent on - to the page
 * ProtectedRoute bounced them from, else the dashboard. This also runs the moment a
 * login succeeds, so it is what actually delivers the user back to that page.
 */
export function PublicOnlyRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  return isAuthenticated ? <Navigate to={location.state?.from || '/dashboard'} replace /> : <Outlet />;
}
