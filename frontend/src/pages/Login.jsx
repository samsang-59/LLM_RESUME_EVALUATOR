import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import Button from '../components/Button';
import InputField from '../components/InputField';
import { useAuth } from '../context/AuthContext';
import { validateLogin } from '../utils/validation';

/** /login - POST /api/auth/login (design 01-login). */
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateLogin(form);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await login({ email: form.email.trim(), password: form.password });
      // Back to the page ProtectedRoute bounced them from, or the dashboard.
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      // 401 = wrong email or password. The backend words both the same on
      // purpose (doc 09), and so do we.
      setFormError(err.status === 401 ? 'Invalid email or password' : err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h2 className="auth-title">Sign in</h2>
        <p className="auth-subtitle">HR access only.</p>
        {formError && (
          <div className="form-alert" role="alert">
            {formError}
          </div>
        )}
        <InputField
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={update('email')}
          error={errors.email}
        />
        <InputField
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
        />
        <Button type="submit" variant="primary" block disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="auth-switch">
          No account yet? <Link to="/register">Create one</Link>
        </p>
        <p className="auth-footnote">
          POST /api/auth/login · returns a JWT, stored client-side and attached as Bearer on every request.
        </p>
      </form>
    </AuthShell>
  );
}
