import { create } from 'zustand';
import { api, setAccessToken, onAuthChange } from './api';

const THEME_KEY = 'yobou-partner:theme';
const DARK_KEY = 'yobou-partner:dark';

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
  const stored = safeGet(THEME_KEY, 'system');
  return ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
}

function applyDark(dark) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', dark);
  }
}

export const useStore = create((set, get) => ({
  user: null,
  bootDone: false,
  theme: initialTheme(),
  dark: themeToDark(initialTheme(), safeGet(DARK_KEY, '0') === '1'),

  setUser(user) { set({ user }); },
  setBootDone(v) { set({ bootDone: v }); },

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

  async logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setAccessToken(null);
    set({ user: null });
  },

  async refresh() {
    try {
      const { user } = await api('/api/auth/me');
      if (user) set({ user });
    } catch { /* unauth -> leave user alone */ }
  },

  async boot() {
    try {
      const r = await fetch(
        (import.meta.env.VITE_API_BASE || '') + '/api/auth/refresh',
        { method: 'POST', credentials: 'include' }
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
    set({ bootDone: true });
  },
}));