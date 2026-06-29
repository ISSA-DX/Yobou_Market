// useSse — subscribe to the server's notification stream (shopper).
//
// Mirrors Internal_Web_Admin/src/lib/useSse.js. The shopper app and the
// admin app each get their own copy because the two apps have separate
// bundles (one ships inside the Capacitor APK).
//
// Usage:
//   useEffect(() => {
//     const off = useNotificationStream((note) => { ... });
//     return off;
//   }, []);
//
// Returns an unsubscribe function. Safe to call with no token (becomes
// a no-op).
import { useEffect, useRef } from 'react';
import { getAccessToken, onAuthChange } from '../api';

const subscribers = new Set();
let eventSource = null;
let reconnectTimer = null;

function close() {
  if (eventSource) {
    try { eventSource.close(); } catch { /* ignore */ }
    eventSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function connect() {
  const token = getAccessToken();
  if (!token) return;
  close();
  const base = import.meta.env.VITE_API_BASE || '';
  // EventSource doesn't support custom headers — pass the token as a
  // query param instead. The server-side middleware reads it from the
  // query string when present.
  const url = `${base}/api/events?t=${encodeURIComponent(token)}`;
  let es;
  try {
    es = new EventSource(url, { withCredentials: true });
  } catch {
    scheduleReconnect();
    return;
  }
  eventSource = es;
  es.addEventListener('notification', (ev) => {
    try {
      const note = JSON.parse(ev.data);
      for (const fn of subscribers) {
        try { fn(note); } catch { /* ignore subscriber errors */ }
      }
    } catch { /* malformed frame */ }
  });
  es.addEventListener('hello', () => {
    // Connection confirmed. Nothing to do — the server sends the hello
    // frame so the client knows it's safe to subscribe.
  });
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  close();
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

let authListener = null;
function ensureAuthListener() {
  if (authListener) return;
  authListener = onAuthChange(({ user }) => {
    if (user) connect();
    else close();
  });
}

export function useNotificationStream(onNotification) {
  ensureAuthListener();
  // Use a ref so the subscription stays stable across renders.
  const ref = useRef(onNotification);
  ref.current = onNotification;

  useEffect(() => {
    const wrapper = (note) => {
      try { ref.current?.(note); } catch { /* ignore */ }
    };
    subscribers.add(wrapper);
    // Kick a connect if we have a token but no stream.
    if (!eventSource && getAccessToken()) connect();
    return () => {
      subscribers.delete(wrapper);
    };
  }, []);
}