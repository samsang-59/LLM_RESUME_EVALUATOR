// The one piece of GLOBAL state (doc 10): who is logged in. The navbar, the API
// layer and ProtectedRoute all need it, so it lives app-wide in a Context.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../api';
import { setUnauthorizedHandler, tokenStore } from '../api/client';

const USER_KEY = 'resume_evaluator_user';
const AuthContext = createContext(null);

/**
 * Reads the `exp` claim so an expired token is treated as logged-out on load,
 * instead of letting the first request fail. This is NOT verification - only the
 * backend can check the signature - it just saves a pointless round trip.
 */
export function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return true; // unreadable = unusable
  }
}

function readStoredSession() {
  const token = tokenStore.get();
  if (!token || isTokenExpired(token)) return { token: null, user: null };
  try {
    return { token, user: JSON.parse(localStorage.getItem(USER_KEY)) };
  } catch {
    return { token, user: null };
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);

  const startSession = useCallback(({ token, user }) => {
    tokenStore.set(token);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* storage blocked */
    }
    setSession({ token, user });
  }, []);

  const logout = useCallback(() => {
    api.logout();
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* nothing to clear */
    }
    setSession({ token: null, user: null });
  }, []);

  const login = useCallback(async (credentials) => startSession(await api.login(credentials)), [startSession]);
  const register = useCallback(async (details) => startSession(await api.register(details)), [startSession]);

  // A guarded door answering 401 means the token died (expired, or the secret
  // changed). Drop the session; ProtectedRoute then sends the user to /login.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(() => {});
  }, [logout]);

  const value = useMemo(
    () => ({ ...session, isAuthenticated: Boolean(session.token), login, register, logout }),
    [session, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
