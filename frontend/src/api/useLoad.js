import { useCallback, useEffect, useState } from 'react';

/**
 * Page-load reads (doc 10: "an event calls the API layer - page-load for reads").
 * Runs `load` when the page mounts or `deps` change, and tracks the three states
 * every screen handles: loading, ready, error. `reload` is the Retry button.
 *
 * A late answer for a stale request is dropped, so switching quickly between two
 * jobs can never show the first job's candidates under the second job's title.
 */
export default function useLoad(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    load().then(
      (data) => current && setState({ status: 'ready', data, error: null }),
      (error) => current && setState({ status: 'error', data: null, error })
    );
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller owns deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
