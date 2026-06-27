import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Tiny fetch helper that turns the app's silent-fail anti-pattern into
 * proper { data, error, loading, refetch } state.
 */
export function useApi(path, opts = {}) {
  const { fn, deps = [], method = 'GET', body, headers, auth = true, skip = false } = opts;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const reqId = useRef(0);

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
  }, [path, JSON.stringify(body), JSON.stringify(headers), method, auth, skip, ...deps]);

  useEffect(() => {
    if (skip) {
      setLoading(false);
      return;
    }
    run();
  }, [run, skip]);

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