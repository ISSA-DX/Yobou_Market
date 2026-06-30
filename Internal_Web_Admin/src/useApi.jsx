import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Tiny fetch helper that turns the app's silent-fail anti-pattern into
 * proper { data, error, loading, refetch } state.
 *
 * Stability notes (this hook has caused render loops in the past):
 *   - `path` MUST be a stable primitive (string or null). Do NOT pass a
 *     template literal that depends on a value created inline at the
 *     call site — that path is recreated on every render and the
 *     `useCallback` cache thrashes, triggering an infinite refetch
 *     cycle. Pass a memoised string from the consumer instead.
 *   - `body` and `headers` are spread into the fetch options as-is.
 *     Reference changes are fine; we compare them via shallow equality
 *     on JSON-stringified form to decide whether to refetch.
 */
export function useApi(path, opts = {}) {
  const { fn, deps = [], method = 'GET', body, headers, auth = true, skip = false } = opts;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const reqId = useRef(0);

  // Pre-stringify deps so the useCallback below doesn't re-create the
  // function on every render. Strings are compared by value, so two
  // identical bodies still hit the cache.
  const bodyStr = body === undefined ? '' : JSON.stringify(body);
  const headersStr = headers === undefined ? '' : JSON.stringify(headers);

  const run = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const args = { method, body, headers, auth };
      const result = fn ? await fn() : await api(path, args);
      if (reqId.current !== myReq) return;
      setData(result);
    } catch (e) {
      if (reqId.current !== myReq) return;
      setError(e);
    } finally {
      if (reqId.current === myReq) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, bodyStr, headersStr, method, auth, skip, ...deps]);

  useEffect(() => {
    if (skip) {
      setLoading(false);
      return;
    }
    run();
    // run is memoised via useCallback so the dep set is stable; tracking
    // it explicitly here would re-fire the effect whenever `run` is
    // recomputed (e.g. when `body` is a new object reference each
    // render), which is exactly the render-loop we want to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, bodyStr, headersStr, method, skip, auth, ...deps]);

  return { data, error, loading, refetch: run, setData };
}

export function RetryError({ message, onRetry }) {
  return (
    <div className="p-8 text-center">
      <div className="text-on-surface-variant text-sm">
        {message || "Couldn't load this page."}
      </div>
      <button type="button" onClick={onRetry} className="btn-primary mt-4 px-5 py-2">
        Try again
      </button>
    </div>
  );
}