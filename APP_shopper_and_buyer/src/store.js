import { create } from 'zustand';
import { api, setAccessToken, onAuthChange } from './api';

const THEME_KEY = 'yobou:theme';
const DARK_KEY = 'yobou:dark';
const WISHLIST_KEY = 'yobou:wishlist';

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function safeParse(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function readWishlist() {
  const parsed = safeParse(WISHLIST_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function writeWishlist(ids) {
  safeSet(WISHLIST_KEY, JSON.stringify(ids));
}

function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function themeToDark(theme, fallback = false) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return systemPrefersDark() || fallback;
}

function initialTheme() {
  // Legacy: if a boolean dark value was stored, migrate it to a theme string.
  const legacyDark = safeGet(DARK_KEY, null);
  if (legacyDark === '1') {
    safeSet(THEME_KEY, 'dark');
    try { localStorage.removeItem(DARK_KEY); } catch {}
    return 'dark';
  }
  if (legacyDark === '0') {
    safeSet(THEME_KEY, 'light');
    try { localStorage.removeItem(DARK_KEY); } catch {}
    return 'light';
  }
  // Default = 'light' (white + blue brand). Users can opt-in to dark via the
  // preferences page. Existing users who explicitly chose 'dark' or 'light'
  // keep their choice — the fallback only applies on first launch.
  const stored = safeGet(THEME_KEY, 'light');
  if (['light', 'dark', 'system'].includes(stored)) return stored;
  return 'light';
}

function applyDark(dark) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', dark);
  }
}

// v0.3.13 stale-response dedup token. Monotonic per-module id so
// refreshCartCount() can discard older in-flight responses. Lives
// at module scope rather than inside the create() closure because
// the object literal that create() returns can't host a `let` —
// putting it here keeps the dedup state co-located with the store
// and avoids leaking the variable into any future HMR reload.
let cartReqId = 0;

export const useStore = create((set, get) => ({
  user: null,
  bootDone: false,
  cartCount: 0,
  theme: initialTheme(),
  dark: themeToDark(initialTheme(), safeGet(DARK_KEY, '0') === '1'),
  wishlist: readWishlist(),

  setUser(user) {
    set({ user });
  },

  setBootDone(v) {
    set({ bootDone: v });
  },

  _applyTheme(theme, persist = true) {
    const dark = themeToDark(theme);
    safeSet(THEME_KEY, theme);
    applyDark(dark);
    set({ theme, dark });
    if (persist && get().user) {
      return api('/api/auth/me', { method: 'PATCH', body: { theme } });
    }
    return Promise.resolve();
  },

  setTheme(theme, persist = true) {
    return get()._applyTheme(theme, persist);
  },

  toggleDark() {
    const nextTheme = get().theme === 'dark' ? 'light' : get().theme === 'light' ? 'system' : 'dark';
    return get()._applyTheme(nextTheme, true);
  },

  toggleWishlist(productId) {
    const list = get().wishlist;
    const next = list.includes(productId)
      ? list.filter((id) => id !== productId)
      : [...list, productId];
    writeWishlist(next);
    set({ wishlist: next });
  },

  isWishlisted(productId) {
    return get().wishlist.includes(productId);
  },

  async login(email, password) {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
    if (!data?.accessToken || !data?.user) {
      const err = new Error(data?.error || 'LOGIN_FAILED');
      err.data = data;
      throw err;
    }
    setAccessToken(data.accessToken);
    if (data.user.theme && ['light', 'dark', 'system'].includes(data.user.theme)) {
      get()._applyTheme(data.user.theme, false);
    }
    set({ user: data.user });
    return data.user;
  },

  async register(payload) {
    const data = await api('/api/auth/register', { method: 'POST', body: payload, auth: false });
    if (!data?.accessToken || !data?.user) {
      const err = new Error(data?.error || 'REGISTER_FAILED');
      err.data = data;
      throw err;
    }
    setAccessToken(data.accessToken);
    set({ user: data.user });
    return data.user;
  },

  async logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setAccessToken(null);
    set({ user: null, cartCount: 0 });
  },

  async updateProfile(payload) {
    const data = await api('/api/auth/me', { method: 'PATCH', body: payload });
    if (!data?.user) throw new Error(data?.error || 'UPDATE_FAILED');
    if (data.user.theme && data.user.theme !== get().theme) {
      get()._applyTheme(data.user.theme, false);
    }
    set({ user: data.user });
    return data.user;
  },

  async updatePreferences(payload) {
    return get().updateProfile(payload);
  },

  // v0.3.13 stale-response dedup (see module-scope `let cartReqId`
  // at the top of this file). MobileShell's user-change useEffect
  // and quickAdd's explicit post-add call fire in parallel — the
  // EARLIER (empty-cart) response can resolve after the LATER
  // (populated-cart) one and overwrite the count back to 0, leaving
  // the badge empty even though the item is on the server. Only
  // the newest call's response may write to zustand.
  async refreshCartCount() {
    const myId = ++cartReqId;
    const user = get().user;
    // Guests have a server-side User row (created via /api/auth/guest)
    // and a valid access token, so /api/cart works for them too. The
    // ensureGuestSession helper handles the silent-signin if no user
    // is in zustand yet (e.g. boot just finished with no refresh cookie).
    if (!user) {
      const ensured = await get().ensureGuestSession();
      if (!ensured) {
        if (myId === cartReqId) set({ cartCount: 0 });
        return;
      }
    }
    try {
      const { items } = await api('/api/cart');
      if (myId !== cartReqId) return; // stale — newer call took over
      set({ cartCount: items.reduce((s, i) => s + i.quantity, 0) });
    } catch {
      if (myId === cartReqId) set({ cartCount: 0 });
    }
  },

  // Mint a silent guest user on the server so anonymous shoppers can
  // hit any auth-gated route (/api/cart, /api/orders, /api/checkout)
  // without an account. The server stores the resulting refresh token
  // in a cookie so subsequent page loads stay signed in as the same
  // guest. Idempotent — calling this when a real user is already
  // signed in is a no-op.
  async ensureGuestSession() {
    if (get().user) return get().user;
    try {
      const data = await api('/api/auth/guest', { method: 'POST', auth: false });
      if (!data?.accessToken || !data?.user) return null;
      setAccessToken(data.accessToken);
      set({ user: data.user });
      return data.user;
    } catch {
      return null;
    }
  },

  // Called once on boot to restore the session from the refresh cookie.
  async boot() {
    try {
      // cache: 'no-store' + Date.now() suffix defends against the
      // Capacitor WebView serving a stale cached 401 from a prior
      // session that was already in the disk cache. Without this,
      // a shopper reopening the app after a server restart would
      // see "Couldn't load your cart" forever — the refresh would
      // never actually reach the server.
      // CRITICAL: no Cache-Control / Pragma headers — those are
      // not CORS-safelisted and the WebView's preflight gets
      // rejected by the server's Content-Type + Authorization
      // allow-list. See api.js api() for full rationale.
      const r = await fetch(
        (import.meta.env.VITE_API_BASE || '') + '/api/auth/refresh?_t=' + Date.now(),
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        }
      );
      if (r.ok) {
        const data = await r.json();
        if (data?.accessToken && data?.user) {
          setAccessToken(data.accessToken);
          if (data.user.theme && ['light', 'dark', 'system'].includes(data.user.theme)) {
            get()._applyTheme(data.user.theme, false);
          }
          set({ user: data.user });
        }
      }
    } catch { /* no-op */ }

    applyDark(get().dark);

    // Keep dark mode in sync when the user changes OS theme while on 'system'.
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        if (get().theme === 'system') {
          set({ dark: themeToDark('system') });
          applyDark(get().dark);
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }

    onAuthChange(({ user }) => set({ user }));
    if (get().user) await get().refreshCartCount();
    set({ bootDone: true });
  },
}));
