// useSse — subscribe to the server's notification stream.
// Source of truth: Internal_Web_Admin/src/lib/useSse.js (kept in sync).
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
    try { dispatch(notificationSubscribers, JSON.parse(ev.data)); } catch { /* malformed frame */ }
  });
  // Catalog broadcast (no DB row — pure SSE). Fires on product CRUD +
  // category CRUD so list pages can refetch without a round trip.
  es.addEventListener('catalog', (ev) => {
    try { dispatch(catalogSubscribers, JSON.parse(ev.data)); } catch { /* malformed frame */ }
  });
  es.addEventListener('hello', () => { /* connection confirmed */ });
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
  const ref = useRef(onNotification);
  ref.current = onNotification;

  useEffect(() => {
    const wrapper = (note) => {
      try { ref.current?.(note); } catch { /* ignore */ }
    };
    notificationSubscribers.add(wrapper);
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