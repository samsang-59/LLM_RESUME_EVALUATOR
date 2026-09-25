// Shared test tools. The backend is mocked at the fetch boundary - the whole
// frontend (pages, API layer, AuthContext, routes) runs for real above it.
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import App from '../src/App';

/** An unsigned JWT-shaped token. The frontend only ever reads `exp`; the backend verifies. */
export function fakeToken({ expiresInSeconds = 3600 } = {}) {
  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 1, exp })}.signature`;
}

export const HR_USER = { id: 1, username: 'Priya Raman', email: 'priya@northwind.hr' };

/** Put a session in storage, as a previous login would have. */
export function signIn(token = fakeToken(), user = HR_USER) {
  localStorage.setItem('resume_evaluator_token', token);
  localStorage.setItem('resume_evaluator_user', JSON.stringify(user));
  return token;
}

const REPLY = Symbol('reply');

/** A non-200 answer from a mock route: `return respond(401, { error, message })`. */
export function respond(status, body) {
  return { [REPLY]: true, status, body };
}

/**
 * Replace fetch with a tiny fake backend. `routes` maps "METHOD /path" to a handler
 * returning a body (200), respond(status, body), or an Error (network failure). The path is matched
 * WITHOUT its query string; the handler gets the parsed URL to inspect it.
 * Every call is recorded on the returned `calls` array.
 */
export function mockBackend(routes) {
  const calls = [];
  const fetchMock = vi.fn(async (input, init = {}) => {
    const url = new URL(input, 'http://localhost');
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    const call = { method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: init.headers || {}, body };
    calls.push(call);

    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return jsonResponse(404, { error: 'not_found', message: `No mock for ${method} ${url.pathname}` });

    const result = await handler(call);
    if (result instanceof Error) throw result; // simulate a network failure
    return result && result[REPLY] ? jsonResponse(result.status, result.body) : jsonResponse(200, result);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/** A request that never answers - for asserting the loading state. */
export const pending = () => new Promise(() => {});

/** Render the real App at a route. */
export function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );
}

/* ---------- fixtures shaped exactly like the backend's responses ---------- */

export const JOB = {
  id: 1,
  title: 'Senior Backend Engineer (Node.js)',
  mustHaveSkills: ['Node.js', 'Express', 'PostgreSQL', 'REST API design'],
  goodToHaveSkills: ['Redis'],
  requiredExperienceYears: 5,
  matchingMode: 'strict',
  cutoffPercentage: 70,
  createdAt: '2026-08-12 09:00:00',
};

export const candidate = (overrides = {}) => ({
  resumeId: 11,
  name: 'Ananya Deshpande',
  email: 'ananya.deshpande@gmail.com',
  phone: '+91 98204 41127',
  listedSkills: [],
  usedSkills: [],
  totalExperienceYears: 7,
  uploadedAt: '2026-08-14 09:12:00',
  ...overrides,
});

const baseEvaluation = {
  jobId: 1,
  callbackUrl: 'https://ats.example.com/hook',
  deliveryStatus: 'delivered',
  requiredExperienceYears: 5,
  createdAt: '2026-08-14 09:12:00',
};

export const ELIGIBLE = {
  ...baseEvaluation,
  id: 7,
  resumeId: 11,
  status: 'completed',
  failureReason: null,
  eligible: true,
  matchedRequiredSkills: ['Node.js', 'Express', 'PostgreSQL', 'REST API design'],
  missingSkills: [],
  extraSkills: ['Redis', 'Docker', 'Kafka', 'Terraform'],
  candidateExperienceYears: 7,
  overallPercentage: 92,
  candidate: candidate(),
};

export const REJECTED = {
  ...baseEvaluation,
  id: 8,
  resumeId: 12,
  status: 'completed',
  failureReason: null,
  eligible: false,
  matchedRequiredSkills: ['Node.js', 'PostgreSQL'],
  missingSkills: ['Express', 'REST API design'],
  extraSkills: ['Fastify'],
  candidateExperienceYears: 4,
  overallPercentage: 68,
  candidate: candidate({ name: 'Karthik Menon', email: 'k.menon@zohomail.com', phone: '+91 88671 03392' }),
};

export const PROCESSING = {
  ...baseEvaluation,
  id: 9,
  resumeId: null,
  status: 'processing',
  failureReason: null,
  deliveryStatus: 'pending',
  eligible: null,
  matchedRequiredSkills: null,
  missingSkills: null,
  extraSkills: null,
  requiredExperienceYears: null,
  candidateExperienceYears: null,
  overallPercentage: null,
  candidate: null,
};

export const FAILED = {
  ...PROCESSING,
  id: 10,
  status: 'failed',
  failureReason: 'unreadable_resume',
  deliveryStatus: 'delivered',
};
