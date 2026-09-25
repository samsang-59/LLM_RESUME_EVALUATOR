import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { initials } from '../utils/format';

/** The page shell every HR screen shares: brand, Jobs link, theme toggle, user, logout. */
export function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // "Jobs" stays highlighted on every job-related screen, not only /dashboard.
  const onJobs = pathname === '/dashboard' || pathname.startsWith('/jobs') || pathname.startsWith('/evaluations');

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="navbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Resume Evaluator</span>
      </div>
      <nav className="nav-links" aria-label="Main">
        <NavLink to="/dashboard" className={() => `nav-link${onJobs ? ' active' : ''}`}>
          Jobs
        </NavLink>
      </nav>
      <div className="nav-right">
        <button
          type="button"
          className="btn btn-icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        {user && (
          <>
            <span className="avatar" aria-hidden="true">
              {initials(user.username, user.email)}
            </span>
            <span className="nav-email">{user.email}</span>
          </>
        )}
        <button type="button" className="btn btn-sm" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}

export default function Layout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}
