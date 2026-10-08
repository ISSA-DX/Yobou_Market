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
  // v0.3.13 token-wipeout guard. Capture the in-memory token that
  // triggered this refresh. If the catch below runs, only nullify
  // the token if NO fresher session was minted in the meantime
  // (e.g. ensureGuestSession succeeded and set a new guest token
  // while this refresh round-trip was still in flight). The bug
  // it fixes: an early background 401 from a hydrated stale
  // localStorage token kicks off refresh, the user taps Add to
  // Cart, ensureGuestSession mints a fresh guest, the POST
  // succeeds, the background refresh eventually fails, and the
  // blind setAccessToken(null) wipes the fresh token — leaving
  // the next refreshCartCount and useApi('/api/cart') 401ing and
  // the cart badge stuck at 0 with "Couldn't load your cart".
  const currentToken = accessToken;
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
  })
    .then(async (r) => {
      if (!r.ok) throw new Error('NO_REFRESH');
      const data = await r.json();
      // v0.3.13 success-path guard (reviewer NIT 1). If a fresher
      // token was installed while this refresh was in flight (e.g.
      // ensureGuestSession minted a guest for an in-progress Add to
      // Cart), don't clobber it. Returning data.accessToken without
      // writing it lets the next api() call in the chain use the
      // fresh in-memory token, not the rotated-but-stale-by-context
      // one. The returned value is unused by today's api() 401
      // handler (which just re-calls api()), but returning it keeps
      // the contract intact for any future caller.
      if (accessToken !== currentToken) return data.accessToken;
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
      // Only wipe the token if no fresher one was installed in
      // the meantime. See the comment above currentToken for the
      // full race-condition story.
      if (accessToken === currentToken) {
        setAccessToken(null);
        notifyAuthChange({ user: null });
      }
      throw err;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

const MAX_NETWORK_RETRIES = 3;
const RETRY_BASE_MS = 500;

function isIdempotent(method) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

export async function api(path, { method = 'GET', body, headers = {}, auth = true, retry = true, retryCount = 0, retryNetwork = false } = {}) {
  // A unique query parameter prevents Android WebView from replaying stale
  // cached GET responses. POST/PUT/PATCH requests are already non-cacheable.
  const noCacheSuffix = method === 'GET' || method === 'HEAD'
    ? `${path.includes('?') ? '&' : '?'}_t=${Date.now()}`
    : '';
  const opts = {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (auth && accessToken) opts.headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) opts.body = JSON.stringify(body);

  // Network-level failures (offline, DNS, browser CORS rejection) throw a
  // TypeError("Failed to fetch") before we ever see a Response. Wrap the call
  // so the error carries a `code` and a useful `message`, so callers can
  // distinguish "no network" from a real HTTP error.
  // Idempotent GETs are retried with exponential backoff so a brief dropout
  // doesn't break the home feed or search.
  let res;
  try {
    // noCacheSuffix flips GETs into unique-URL fetches so the Android
    // Capacitor WebView can't replay a stale 401 body from the prior
    // /api/cart or /api/products hit. POSTs already use a body so the
    // suffix isn't appended — POST requests aren't cached by fetch.
    res = await fetch(`${BASE}${path}${noCacheSuffix}`, opts);
  } catch (networkErr) {
    if (retry && (isIdempotent(method) || retryNetwork) && retryCount < MAX_NETWORK_RETRIES) {
      const delay = RETRY_BASE_MS * 2 ** retryCount;
      await new Promise((r) => setTimeout(r, delay));
      return api(path, { method, body, headers, auth, retry, retryCount: retryCount + 1, retryNetwork });
    }
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
    // v0.3.13 token-wipeout guard. Capture the token that just 401'd
    // so the catch can tell whether a fresher token was installed
    // (by ensureGuestSession) while the refresh round-trip was in
    // flight. See refreshAccessToken's comment for the full story.
    const failedToken = accessToken;
    // Try one silent refresh, then retry once.
    try {
      await refreshAccessToken();
      return api(path, { method, body, headers, auth, retry: false });
    } catch {
      // Only clear the token if no fresher one was installed. If
      // accessToken already moved on (e.g. ensureGuestSession set
      // a fresh guest while the refresh was in flight), keep it —
      // a forced clear would orphan the valid session and break
      // the next request in the chain.
      if (accessToken === failedToken) {
        // Clear via the central setAccessToken() so localStorage
        // retracts in lockstep. Using setAccessToken() keeps disk
        // + memory in lockstep on every transition.
        setAccessToken(null);
        notifyAuthChange({ user: null });
      }
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
    // Also do NOT add Cache-Control / Pragma — they trigger CORS
    // preflight rejection on the cross-site Android WebView.
    // See api() for full rationale.
    body,
  };
  if (auth && accessToken) opts.headers = { Authorization: `Bearer ${accessToken}` };

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
    // v0.3.13 token-wipeout guard. Same shape as api()'s 401 catch.
    const failedToken = accessToken;
    try {
      await refreshAccessToken();
      return apiForm(path, { method, body, auth, retry: false });
    } catch {
      // Only clear the token if no fresher one was installed. If
      // ensureGuestSession replaced it during the refresh, keep it.
      if (accessToken === failedToken) {
        // Mirror the api() 401 catch: clear via setAccessToken so
        // localStorage retracts in lockstep. See the api() catch above
        // for the full rationale.
        setAccessToken(null);
        notifyAuthChange({ user: null });
      }
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
