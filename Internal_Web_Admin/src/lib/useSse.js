// useSse — subscribe to the server's notification stream.
//
// Opens a single EventSource per call, listens for `event: notification`
// AND `event: catalog` frames, and exposes them via two hooks:
//   - useNotificationStream: per-user inbox pushes (notification rows).
//   - useCatalogStream: broadcast frames for "catalog changed" events
//     (product_created / product_updated / product_deleted / category_*).
//
// The same EventSource carries both channels (the server multiplexes them
// over one SSE connection). Reconnects automatically if the connection
// drops (EventSource's built-in retry).
//
// Usage:
//   useEffect(() => {
//     const off = useNotificationStream((note) => { ... });
//     const off2 = useCatalogStream((frame) => { ... });
//     return () => { off(); off2(); };
//   }, []);
//
// Returns an unsubscribe function. Safe to call with no token (becomes
// a no-op).
import { useEffect, useRef } from 'react';
import { getAccessToken, onAuthChange } from '../api';

const notificationSubscribers = new Set();
const catalogSubscribers = new Set();
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

function dispatch(set, payload) {
  for (const fn of set) {
    try { fn(payload); } catch { /* ignore subscriber errors */ }
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
      dispatch(notificationSubscribers, JSON.parse(ev.data));
    } catch { /* malformed frame */ }
  });
  // Catalog broadcast (no DB row — pure SSE). Fires on product CRUD +
  // category CRUD so list pages can refetch without a round trip.
  es.addEventListener('catalog', (ev) => {
    try {
      dispatch(catalogSubscribers, JSON.parse(ev.data));
    } catch { /* malformed frame */ }
  });
  es.addEventListener('hello', () => {
    // Connection confirmed. Nothing to do — the server sends the hello
    // frame so the client knows it's safe to subscribe.
  });
  es.onerror = () => {
    // EventSource auto-reconnects; we just track the state. If the
    // server dropped auth, close + reopen on next token change.
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
    notificationSubscribers.add(wrapper);
    // Kick a connect if we have a token but no stream.
    if (!eventSource && getAccessToken()) connect();
    return () => {
      notificationSubscribers.delete(wrapper);
    };
  }, []);
}

export function useCatalogStream(onCatalog) {
  ensureAuthListener();
  const ref = useRef(onCatalog);
  ref.current = onCatalog;

  useEffect(() => {
    const wrapper = (frame) => {
      try { ref.current?.(frame); } catch { /* ignore */ }
    };
    catalogSubscribers.add(wrapper);
    if (!eventSource && getAccessToken()) connect();
    return () => {
      catalogSubscribers.delete(wrapper);
    };
  }, []);
}
