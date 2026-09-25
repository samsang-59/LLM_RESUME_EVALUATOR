// The one function every backend call goes through (doc 10: the frontend's
// "repository"). It attaches the JWT, turns a non-2xx answer into an ApiError, and
// tells AuthContext when the token has stopped working.

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'resume_evaluator_token';

/** A failed request, carrying the backend's own error body ({ error, message, details }). */
export class ApiError extends Error {
  constructor(status, body = {}) {
    super(body.message || `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status; // 0 = the request never reached the server
    this.code = body.error;
    this.details = body.details;
  }
}

// v1 token storage is localStorage (doc 10). Readable by any script on the page,
// so an XSS bug could steal it - moving to an httpOnly cookie is parked for Phase 7.
export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage blocked - the session just won't survive a reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};

let onUnauthorized = () => {};

/** AuthContext registers what to do when a guarded door answers 401 (expired / revoked token). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

/**
 * @param {string} path  e.g. '/api/jobs'
 * @param {{method?: string, body?: object, query?: object, auth?: boolean}} [options]
 */
export async function request(path, { method = 'GET', body, query, auth = true } = {}) {
  let url = BASE_URL + path;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? tokenStore.get() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { message: 'Could not reach the server. Check your connection.' });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // A 401 from a guarded door means the token is missing, expired or tampered
    // with. A 401 from the login door is just a wrong password - not a logout.
    if (res.status === 401 && auth) onUnauthorized();
    throw new ApiError(res.status, data);
  }
  return data;
}
