// useNotifications — load the user's inbox + react to SSE pushes.
// Shopper-side counterpart of Internal_Web_Admin/src/lib/useNotifications.js.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useNotificationStream } from './useSse';

export function useNotifications(limit = 20) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await api(`/api/notifications?limit=${limit}`);
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // If the call fails (logged out, server down), keep last-known state.
    }
  }, [limit]);

  useEffect(() => { refresh(); }, [refresh]);

  useNotificationStream((note) => {
    setNotifications((prev) => [note, ...prev.filter((n) => n.id !== note.id)].slice(0, limit));
    if (!note.readAt) setUnreadCount((c) => c + 1);
  });

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt || new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
    } catch { /* best-effort */ }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
    } catch { /* best-effort */ }
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, refresh };
}