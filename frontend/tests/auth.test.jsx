// Login / Register screens, AuthContext and ProtectedRoute (doc 09 + doc 10 §5).
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { HR_USER, fakeToken, mockBackend, renderApp, respond, signIn } from './helpers';

const jobsDoor = { 'GET /api/jobs': () => [] };

describe('Phase 6 - ProtectedRoute', () => {
  test.each(['/dashboard', '/jobs/new', '/jobs/1/candidates', '/evaluations/7'])(
    'logged out: %s redirects to /login',
    async (path) => {
      const { fetchMock } = mockBackend(jobsDoor);
      renderApp(path);
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled(); // the page never mounted, so nothing was fetched
    }
  );

  test('an expired token counts as logged out', async () => {
    signIn(fakeToken({ expiresInSeconds: -60 }));
    mockBackend(jobsDoor);
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('a garbage token counts as logged out', async () => {
    signIn('not-a-jwt');
    mockBackend(jobsDoor);
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('a valid token reaches the protected page', async () => {
    signIn();
    mockBackend(jobsDoor);
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
  });

  test('already signed in: /login and /register go to the dashboard', async () => {
    signIn();
    mockBackend(jobsDoor);
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
  });

  test('"/" goes to the dashboard (and so to /login when logged out)', async () => {
    mockBackend(jobsDoor);
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('a 401 mid-session (token revoked / expired server-side) sends the user to /login', async () => {
    signIn();
    mockBackend({ 'GET /api/jobs': () => respond(401, { error: 'unauthorized', message: 'Token expired' }) });
    renderApp('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(localStorage.getItem('resume_evaluator_token')).toBeNull();
  });
});

describe('Phase 6 - Login screen', () => {
  test('renders the design: title, fields, button, link to register', async () => {
    mockBackend({});
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText('HR access only.')).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/register');
  });

  test('success: calls POST /api/auth/login, stores the token, lands on the dashboard', async () => {
    const token = fakeToken();
    const { calls } = mockBackend({
      'POST /api/auth/login': () => ({ token, user: HR_USER }),
      ...jobsDoor,
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), 'priya@northwind.hr');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/auth/login', body: { email: 'priya@northwind.hr', password: 'correct horse' } });
    expect(localStorage.getItem('resume_evaluator_token')).toBe(token);
    // ...and the very next request carries it
    const jobsCall = calls.find((c) => c.path === '/api/jobs');
    expect(jobsCall.headers.Authorization).toBe(`Bearer ${token}`);
    expect(screen.getByText('priya@northwind.hr')).toBeInTheDocument(); // navbar shows the user
  });

  test('after login, the user returns to the page they were bounced from', async () => {
    mockBackend({
      'POST /api/auth/login': () => ({ token: fakeToken(), user: HR_USER }),
      'GET /api/jobs/1': () => ({ id: 1, title: 'Data Engineer', mustHaveSkills: ['SQL'], goodToHaveSkills: [], requiredExperienceYears: 2, matchingMode: 'soft', cutoffPercentage: 60, createdAt: '2026-07-28 10:00:00' }),
      'GET /api/jobs/1/evaluations': () => [],
    });
    renderApp('/jobs/1/candidates');
    await userEvent.type(await screen.findByLabelText('Work email'), 'priya@northwind.hr');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Data Engineer' })).toBeInTheDocument();
  });

  test('wrong password or unknown email (401): one message, the same for both', async () => {
    mockBackend({ 'POST /api/auth/login': () => respond(401, { error: 'unauthorized', message: 'Invalid email or password' }) });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), 'priya@northwind.hr');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(localStorage.getItem('resume_evaluator_token')).toBeNull();
  });

  test('empty form: client-side errors, and no request is sent', async () => {
    const { fetchMock } = mockBackend({});
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('a valid email is required')).toBeInTheDocument();
    expect(screen.getByText('password is required')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('server unreachable: a friendly message, the form stays usable', async () => {
    mockBackend({ 'POST /api/auth/login': () => new TypeError('Failed to fetch') });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), 'priya@northwind.hr');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });
});

describe('Phase 6 - Register screen', () => {
  const fill = async ({ name = 'Priya Raman', email = 'priya@northwind.hr', password = 'correct horse' } = {}) => {
    if (name) await userEvent.type(await screen.findByLabelText('Name'), name);
    if (email) await userEvent.type(screen.getByLabelText('Work email'), email);
    if (password) await userEvent.type(screen.getByLabelText('Password'), password);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  };

  test('renders the design, including the bcrypt / 8-character hint', async () => {
    mockBackend({});
    renderApp('/register');
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
    expect(screen.getByText('Hashed with bcrypt. Minimum 8 characters.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  test('success (201): sends username/email/password, signs in straight away', async () => {
    const { calls } = mockBackend({
      'POST /api/auth/register': () => respond(201, { token: fakeToken(), user: HR_USER }),
      ...jobsDoor,
    });
    renderApp('/register');
    await fill();
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(calls[0].body).toEqual({ username: 'Priya Raman', email: 'priya@northwind.hr', password: 'correct horse' });
  });

  test('duplicate email (409): the backend message shows under the email field', async () => {
    mockBackend({ 'POST /api/auth/register': () => respond(409, { error: 'conflict', message: 'That email is already registered' }) });
    renderApp('/register');
    await fill();
    expect(await screen.findByText('That email is already registered')).toBeInTheDocument();
    expect(screen.getByLabelText('Work email')).toHaveAttribute('aria-invalid', 'true');
  });

  test('weak password: stopped on the client, no request', async () => {
    const { fetchMock } = mockBackend({});
    renderApp('/register');
    await fill({ password: 'short' });
    expect(screen.getByText('password must be at least 8 characters')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a 400 the client missed is shown per field from the backend details', async () => {
    mockBackend({
      'POST /api/auth/register': () =>
        respond(400, { error: 'bad_request', message: 'Validation failed', details: [{ field: 'password', message: 'password is too common' }] }),
    });
    renderApp('/register');
    await fill();
    expect(await screen.findByText('password is too common')).toBeInTheDocument();
  });
});

describe('Phase 6 - Logout', () => {
  test('clears the token and the user, returns to /login', async () => {
    signIn();
    mockBackend(jobsDoor);
    renderApp('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(localStorage.getItem('resume_evaluator_token')).toBeNull();
    expect(localStorage.getItem('resume_evaluator_user')).toBeNull();
  });

  test('after logout, protected pages redirect again', async () => {
    signIn();
    mockBackend(jobsDoor);
    const { unmount } = renderApp('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(localStorage.getItem('resume_evaluator_token')).toBeNull());
    unmount();
    renderApp('/jobs/new');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
