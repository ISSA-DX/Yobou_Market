// Tiny fetch wrapper with access-token + transparent refresh.
const BASE = import.meta.env.VITE_API_BASE || '';

let accessToken = null;
let refreshing = null; // single in-flight refresh promise
const listeners = new Set();

export function setAccessToken(t) {
  accessToken = t;
}

export function getAccessToken() {
  return accessToken;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyAuthChange(state) {
  for (const fn of listeners) fn(state);
}

export async function refreshAccessToken() {
  if (refreshing) return refreshing;
  refreshing = fetch(`${BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) throw new Error('NO_REFRESH');
      const data = await r.json();
      accessToken = data.accessToken;
      notifyAuthChange({ user: data.user });
      return data.accessToken;
    })
    .catch((err) => {
      accessToken = null;
      notifyAuthChange({ user: null });
      throw err;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, { method = 'GET', body, headers = {}, auth = true, retry = true } = {}) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (auth && accessToken) opts.headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) opts.body = JSON.stringify(body);

  // Network-level failures (offline, DNS, browser CORS rejection) throw a
  // TypeError("Failed to fetch") before we ever see a Response. Wrap the call
  // so the error carries a `code` and a useful `message`.
  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch (networkErr) {
    const err = new Error(
      networkErr?.message || 'Network request failed'
    );
    err.code = 'NETWORK_ERROR';
    err.data = {
      error: 'NETWORK_ERROR',
      message:
        'Could not reach the server. Check your internet connection — if you\'re on Wi-Fi, the server may not be reachable from this network.',
    };
    err.cause = networkErr;
    throw err;
  }

  if (res.status === 401 && auth && retry) {
    // Try one silent refresh, then retry once.
    try {
      await refreshAccessToken();
      return api(path, { method, body, headers, auth, retry: false });
    } catch {
      accessToken = null;
      notifyAuthChange({ user: null });
      const err = new Error('UNAUTHENTICATED');
      err.status = 401;
      err.data = { error: 'UNAUTHENTICATED' };
      throw err;
    }
  }
  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function safeParse(t) {
  try { return JSON.parse(t); } catch { return null; }
}

/**
 * Multipart upload helper. Use this when you need to send a FormData body
 * (file uploads, mixed text+file). `api()` cannot carry FormData because it
 * forces `Content-Type: application/json` and JSON-stringifies the body —
 * which silently breaks multipart uploads (multer sees an empty body).
 *
 * Semantics mirror `api()`:
 *   - sends the Authorization header automatically
 *   - transparent refresh + retry on 401
 *   - throws an Error with `code: 'NETWORK_ERROR'` for offline / CORS rejects
 *   - throws an Error with `status` + `data` for non-OK responses
 */
export async function apiForm(path, { method = 'POST', body, auth = true, retry = true } = {}) {
  const opts = {
    method,
    credentials: 'include',
    // Do NOT set Content-Type — the browser will set the correct
    // `multipart/form-data; boundary=...` based on the FormData.
    body,
  };
  if (auth && accessToken) opts.headers = { Authorization: `Bearer ${accessToken}` };

  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch (networkErr) {
    const err = new Error(networkErr?.message || 'Network request failed');
    err.code = 'NETWORK_ERROR';
    err.data = {
      error: 'NETWORK_ERROR',
      message:
        'Could not reach the server. Check your internet connection — if you\'re on Wi-Fi, the server may not be reachable from this network.',
    };
    err.cause = networkErr;
    throw err;
  }

  if (res.status === 401 && auth && retry) {
    try {
      await refreshAccessToken();
      return apiForm(path, { method, body, auth, retry: false });
    } catch {
      accessToken = null;
      notifyAuthChange({ user: null });
      const err = new Error('UNAUTHENTICATED');
      err.status = 401;
      err.data = { error: 'UNAUTHENTICATED' };
      throw err;
    }
  }
  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}