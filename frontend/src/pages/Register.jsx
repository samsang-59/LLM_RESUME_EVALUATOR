import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import Button from '../components/Button';
import InputField from '../components/InputField';
import { useAuth } from '../context/AuthContext';
import { detailsToErrors, validateRegister } from '../utils/validation';

/** /register - POST /api/auth/register (design 02-register). Registering signs you in. */
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateRegister(form);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await register({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err.status === 409) setErrors({ email: err.message });
      else if (err.status === 400 && err.details) setErrors(detailsToErrors(err.details));
      else setFormError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <h2 className="auth-title">Create an account</h2>
        <p className="auth-subtitle">You will be signed in straight away.</p>
        {formError && (
          <div className="form-alert" role="alert">
            {formError}
          </div>
        )}
        <InputField
          label="Name"
          autoComplete="name"
          placeholder="Priya Raman"
          value={form.username}
          onChange={update('username')}
          error={errors.username}
        />
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          help="Hashed with bcrypt. Minimum 8 characters."
        />
        <Button type="submit" variant="primary" block disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
