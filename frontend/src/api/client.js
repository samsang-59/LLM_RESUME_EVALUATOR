// The one function every backend call goes through (doc 10: the frontend's
// "repository"). It attaches the JWT, turns a non-2xx answer into an ApiError, and
// tells AuthContext when the session has stopped working.
//
// Phase 7: the access token now lives 15 minutes. When a guarded door answers 401,
// this layer quietly trades the refresh token for a new pair and retries the request
// once - so HR stays signed in for the refresh token's 7 days without ever seeing it.

const BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'resume_evaluator_token';
const REFRESH_KEY = 'resume_evaluator_refresh';

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

// Token storage is localStorage (doc 10), for both tokens. Readable by any script on
// the page, so an XSS bug could steal them - the Phase 7 review weighed an httpOnly
// cookie against this and kept localStorage for now; the reasoning is in doc 10.
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked - the session just won't survive a reload */
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

export const tokenStore = {
  get: () => read(TOKEN_KEY),
  set: (token) => write(TOKEN_KEY, token),
  getRefresh: () => read(REFRESH_KEY),
  setRefresh: (refreshToken) => write(REFRESH_KEY, refreshToken),
  /** Forget both tokens. */
  clear() {
    remove(TOKEN_KEY);
    remove(REFRESH_KEY);
  },
};

let onUnauthorized = () => {};

/** AuthContext registers what to do when a guarded door answers 401 (expired / revoked token). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

// One refresh at a time. A screen that loads three things at once gets three 401s
// when the token expires; they must share ONE refresh, because the backend spends a
// refresh token on first use and would treat a second use as theft.
let refreshing = null;

/**
 * Trade the stored refresh token for a new pair (POST /api/auth/refresh).
 * @returns {Promise<boolean>} true if there is a fresh access token to retry with
 */
export function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = tokenStore.getRefresh();
      if (!refreshToken) return false;
      try {
        const pair = await request('/api/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
          auth: false,
        });
        tokenStore.set(pair.token);
        tokenStore.setRefresh(pair.refreshToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * @param {string} path  e.g. '/api/jobs'
 * @param {{method?: string, body?: object, query?: object, auth?: boolean, retried?: boolean}} [options]
 *   `retried` is internal: set on the one retry after a refresh, so it cannot loop.
 */
export async function request(path, { method = 'GET', body, query, auth = true, retried = false } = {}) {
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
    // A 401 from a guarded door means the access token is missing, expired or
    // tampered with. Try the refresh token once; only if that fails is the session
    // over. A 401 from the login door is just a wrong password - not a logout.
    if (res.status === 401 && auth) {
      if (!retried && (await refreshSession())) {
        return request(path, { method, body, query, auth, retried: true });
      }
      onUnauthorized();
    }
    throw new ApiError(res.status, data);
  }
  return data;
}
