// Phase 7 - refresh tokens on the frontend (doc 09 hardening, doc 10 §5).
//
// The access token now lives 15 minutes. The API layer trades the refresh token for
// a new pair when a guarded door answers 401, retries once, and only gives up - and
// logs the user out - when the refresh itself is refused.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import * as api from '../src/api';
import { refreshSession, setUnauthorizedHandler, tokenStore } from '../src/api/client';
import { HR_USER, fakeToken, mockBackend, renderApp, respond, signIn } from './helpers';

const REFRESH_KEY = 'resume_evaluator_refresh';
const expiredToken = () => fakeToken({ expiresInSeconds: -60 });

/** A backend whose /api/jobs only accepts `goodToken`, and whose refresh door hands it out. */
function backendWithRefresh({ goodToken = fakeToken(), refreshOk = true } = {}) {
  return mockBackend({
    'GET /api/jobs': ({ headers }) =>
      headers.Authorization === `Bearer ${goodToken}`
        ? []
        : respond(401, { error: 'unauthorized', message: 'Token expired' }),
    'POST /api/auth/refresh': () =>
      refreshOk
        ? { token: goodToken, refreshToken: 'refresh-2', user: HR_USER }
        : respond(401, { error: 'unauthorized', message: 'Invalid refresh token' }),
    'POST /api/auth/logout': () => respond(204, {}),
  });
}

describe('Phase 7 - storing the refresh token', () => {
  test('login stores the refresh token next to the access token', async () => {
    const token = fakeToken();
    mockBackend({
      'POST /api/auth/login': () => ({ token, refreshToken: 'refresh-1', user: HR_USER }),
      'GET /api/jobs': () => [],
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Work email'), 'priya@northwind.hr');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(localStorage.getItem('resume_evaluator_token')).toBe(token);
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-1');
  });

  test('clear() forgets both tokens', () => {
    tokenStore.set('a');
    tokenStore.setRefresh('b');
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
    expect(tokenStore.getRefresh()).toBeNull();
  });
});

describe('Phase 7 - silent refresh in the API layer', () => {
  test('a 401 is answered by refreshing, then the request is retried with the new token', async () => {
    const goodToken = fakeToken();
    tokenStore.set('old.access.token');
    tokenStore.setRefresh('refresh-1');
    const { calls } = backendWithRefresh({ goodToken });

    await expect(api.getJobs()).resolves.toEqual([]);

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/jobs',
      'POST /api/auth/refresh',
      'GET /api/jobs',
    ]);
    expect(calls[1].body).toEqual({ refreshToken: 'refresh-1' });
    expect(calls[1].headers.Authorization).toBeUndefined();
    expect(calls[2].headers.Authorization).toBe(`Bearer ${goodToken}`);
  });

  test('the rotated pair replaces the old one in storage', async () => {
    const goodToken = fakeToken();
    tokenStore.set('old.access.token');
    tokenStore.setRefresh('refresh-1');
    backendWithRefresh({ goodToken });

    await api.getJobs();

    expect(tokenStore.get()).toBe(goodToken);
    expect(tokenStore.getRefresh()).toBe('refresh-2');
  });

  test('the user is not logged out when the refresh works', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    tokenStore.set('old.access.token');
    tokenStore.setRefresh('refresh-1');
    backendWithRefresh();

    await api.getJobs();

    expect(handler).not.toHaveBeenCalled();
    setUnauthorizedHandler(() => {});
  });

  test('a refused refresh ends the session: the handler runs and the error surfaces', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    tokenStore.set('old.access.token');
    tokenStore.setRefresh('refresh-1');
    backendWithRefresh({ refreshOk: false });

    const err = await api.getJobs().catch((e) => e);

    expect(err.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(() => {});
  });

  test('the retry happens ONCE - a second 401 is final, never a loop', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    tokenStore.set('old.access.token');
    tokenStore.setRefresh('refresh-1');
    // The refresh "works" but hands back a token the door still refuses.
    const { calls } = mockBackend({
      'GET /api/jobs': () => respond(401, { error: 'unauthorized', message: 'nope' }),
      'POST /api/auth/refresh': () => ({ token: 't2', refreshToken: 'r2', user: HR_USER }),
    });

    await api.getJobs().catch(() => {});

    expect(calls.map((c) => c.path)).toEqual(['/api/jobs', '/api/auth/refresh', '/api/jobs']);
    expect(handler).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(() => {});
  });

  test('no refresh token stored -> no refresh attempt, straight to logged out', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    tokenStore.set('old.access.token');
    const { calls } = backendWithRefresh();

    await api.getJobs().catch(() => {});

    expect(calls.map((c) => c.path)).toEqual(['/api/jobs']);
    expect(handler).toHaveBeenCalledTimes(1);
    setUnauthorizedHandler(() => {});
  });

  test('three 401s at once share ONE refresh - a second use would look like theft', async () => {
    const goodToken = fakeToken();
    tokenStore.set('old.access.token');
    tokenStore.setRefresh('refresh-1');
    const { calls } = backendWithRefresh({ goodToken });

    await Promise.all([api.getJobs(), api.getJobs(), api.getJobs()]);

    expect(calls.filter((c) => c.path === '/api/auth/refresh')).toHaveLength(1);
  });

  test('refreshSession() reports false when the server cannot be reached', async () => {
    tokenStore.setRefresh('refresh-1');
    mockBackend({ 'POST /api/auth/refresh': () => new TypeError('Failed to fetch') });

    await expect(refreshSession()).resolves.toBe(false);
  });

  test('a 401 from the login door is still just a wrong password - no refresh attempted', async () => {
    tokenStore.setRefresh('refresh-1');
    const { calls } = mockBackend({
      'POST /api/auth/login': () => respond(401, { error: 'unauthorized', message: 'Invalid email or password' }),
    });

    await api.login({ email: 'a@b.co', password: 'x' }).catch(() => {});

    expect(calls.map((c) => c.path)).toEqual(['/api/auth/login']);
  });
});

describe('Phase 7 - the session across a reload', () => {
  test('an expired access token WITH a refresh token stays signed in, and refreshes', async () => {
    signIn(expiredToken());
    localStorage.setItem(REFRESH_KEY, 'refresh-1');
    const { calls } = backendWithRefresh();

    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/auth/refresh')).toBe(true);
  });

  test('an expired access token with NO refresh token is logged out, as before', async () => {
    signIn(expiredToken());
    mockBackend({ 'GET /api/jobs': () => [] });

    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  test('when the refresh is refused, the user lands on /login with storage cleared', async () => {
    signIn(expiredToken());
    localStorage.setItem(REFRESH_KEY, 'refresh-1');
    backendWithRefresh({ refreshOk: false });

    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem(REFRESH_KEY)).toBeNull());
    expect(localStorage.getItem('resume_evaluator_token')).toBeNull();
  });
});

describe('Phase 7 - logout revokes the refresh token on the server', () => {
  test('api.logout POSTs the refresh token to /api/auth/logout and clears both', async () => {
    tokenStore.set('access');
    tokenStore.setRefresh('refresh-1');
    const { calls } = mockBackend({ 'POST /api/auth/logout': () => respond(204, {}) });

    await api.logout();

    expect(calls).toEqual([
      expect.objectContaining({ method: 'POST', path: '/api/auth/logout', body: { refreshToken: 'refresh-1' } }),
    ]);
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(tokenStore.get()).toBeNull();
    expect(tokenStore.getRefresh()).toBeNull();
  });

  test('a server that cannot be reached still logs the user out locally', async () => {
    tokenStore.set('access');
    tokenStore.setRefresh('refresh-1');
    mockBackend({ 'POST /api/auth/logout': () => new TypeError('Failed to fetch') });

    await expect(api.logout()).resolves.toBeUndefined();
    expect(tokenStore.get()).toBeNull();
    expect(tokenStore.getRefresh()).toBeNull();
  });

  test('the Log out button revokes on the server and returns to /login', async () => {
    signIn();
    localStorage.setItem(REFRESH_KEY, 'refresh-1');
    const { calls } = mockBackend({
      'GET /api/jobs': () => [],
      'POST /api/auth/logout': () => respond(204, {}),
    });
    renderApp('/dashboard');

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === '/api/auth/logout')).toBe(true));
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });
});
