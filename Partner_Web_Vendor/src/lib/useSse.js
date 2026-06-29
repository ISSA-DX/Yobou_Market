// useSse — subscribe to the server's notification stream.
// Source of truth: Internal_Web_Admin/src/lib/useSse.js (kept in sync).
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
    subscribers.add(wrapper);
    if (!eventSource && getAccessToken()) connect();
    return () => {
      subscribers.delete(wrapper);
    };
  }, []);
}