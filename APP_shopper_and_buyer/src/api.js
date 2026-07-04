// Tiny fetch wrapper with access-token + transparent refresh.
const BASE = import.meta.env.VITE_API_BASE || '';
// localStorage key for the persisted access token. Hydrated below
// before the first api() call so a previously-signed-in shopper
// survives a hard reload without a server round-trip. Defensively
// wrapped in try/catch because Capacitor / private-browsing / iOS
// Safari "Block all cookies" can throw on getItem / setItem.
const ACCESS_TOKEN_KEY = 'yobou:accessToken';
function readPersistedToken() {
  try { return localStorage.getItem(ACCESS_TOKEN_KEY) || null; }
  catch { return null; }
}
function writePersistedToken(t) {
  try {
    if (t) localStorage.setItem(ACCESS_TOKEN_KEY, t);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch { /* private mode etc. — fall back to in-memory only */ }
}

// Hydrate before any setAccessToken call so the initial api() sends
// the right Bearer header. Prevents the symptom where an unsigned
// /api/cart page hits 401 on cold launch even when the shopper has
// a valid persisted token from a prior session.
let accessToken = readPersistedToken();
let refreshing = null; // single in-flight refresh promise
const listeners = new Set();

export function setAccessToken(t) {
  accessToken = t;
  writePersistedToken(t);
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
  // cache: 'no-store' + a per-request timestamp query string prevent
  // the Android Capacitor WebView from serving a stale cached 401
  // body for an identical-URI refresh POST. The disk-cache replay
  // bug was the load-bearing reason v0.3.9's cart page still hit
  // "Couldn't load your cart": browser re-served the boot-time 401
  // body even after a fresh ensureGuestSession minted a new guest.
  refreshing = fetch(`${BASE}/api/auth/refresh?_t=${Date.now()}`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('NO_REFRESH');
      const data = await r.json();
      // Centralize the in-memory + localStorage write through
      // setAccessToken so the v0.3.10 localStorage invariant has
      // exactly one mutation site. notifyAuthChange stays here
      // because the refresh round-trip is the one place that
      // actually knows the user identity.
      setAccessToken(data.accessToken);
      notifyAuthChange({ user: data.user });
      return data.accessToken;
    })
    .catch((err) => {
      setAccessToken(null);
      notifyAuthChange({ user: null });
      throw err;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, { method = 'GET', body, headers = {}, auth = true, retry = true } = {}) {
  // cache: 'no-store' + per-request Date.now() suffix prevent the
  // Android Capacitor WebView from re-serving a stale 401 body for
  // an identical-URL repeat call (root cause of v0.3.9's "Couldn't
  // load your cart" — see refreshAccessToken for full context).
  // The Cache-Control headers are belt-and-braces: some WebView
  // builds ignore `cache: 'no-store'` but still respect explicit
  // request headers.
  const noCacheSuffix = method === 'GET' && !body ? `?_t=${Date.now()}` : '';
  const opts = {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...headers,
    },
  };
  if (auth && accessToken) opts.headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) opts.body = JSON.stringify(body);

  // Network-level failures (offline, DNS, browser CORS rejection) throw a
  // TypeError("Failed to fetch") before we ever see a Response. Wrap the call
  // so the error carries a `code` and a useful `message`, so callers can
  // distinguish "no network" from a real HTTP error.
  let res;
  try {
    // noCacheSuffix flips GETs into unique-URL fetches so the Android
    // Capacitor WebView can't replay a stale 401 body from the prior
    // /api/cart or /api/products hit. POSTs already use a body so the
    // suffix isn't appended — POST requests aren't cached by fetch.
    res = await fetch(`${BASE}${path}${noCacheSuffix}`, opts);
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
      // Clear via the central setAccessToken() so localStorage retracts
      // in lockstep — the v0.3.10 reviewer flagged that direct
      // `accessToken = null` would orphan a still-valid persisted JWT
      // if a 401 hit after refreshAccessToken() had already written
      // a fresh token. Using setAccessToken() keeps disk + memory
      // in lockstep on every transition.
      setAccessToken(null);
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
    cache: 'no-store',
    // Do NOT set Content-Type — the browser will set the correct
    // `multipart/form-data; boundary=...` based on the FormData.
    body,
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  };
  if (auth && accessToken) opts.headers = { Authorization: `Bearer ${accessToken}`, ...opts.headers };

  let res;
  try {
    res = await fetch(`${BASE}${path}?_t=${Date.now()}`, opts);
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
      // Mirror the api() 401 catch: clear via setAccessToken so
      // localStorage retracts in lockstep. See the api() catch above
      // for the full rationale.
      setAccessToken(null);
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