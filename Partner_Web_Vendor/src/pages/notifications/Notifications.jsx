import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { api } from '../../api';
import { useApi, RetryError } from '../../useApi.jsx';
import { useStore } from '../../store';
import { toast } from '../../lib/toast';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Notifications() {
  const user = useStore((s) => s.user);
  const { data, error, loading, refetch } = useApi('/api/notifications/mine?limit=50');
  const list = data?.notifications || [];
  const unread = list.filter((n) => !n.readAt).length;

  async function markAllRead() {
    try {
      await api('/api/notifications/read-all', { method: 'POST' });
      toast.success('Marked all as read');
      refetch();
    } catch (e) {
      toast.error(e.data?.error || e.message || 'Could not mark read.');
    }
  }

  if (error && !data) {
    return <RetryError message="Couldn't load notifications." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-headline-lg font-bold">Notifications</h1>
          <p className="text-on-surface-variant text-sm">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary">
            <Icon name="done_all" /> Mark all read
          </button>
        )}
      </div>

      {loading && !data && (
        <div className="card p-8 text-center text-on-surface-variant">
          <Icon name="progress_activity" className="text-[24px] animate-spin inline-block" />
          <span className="ml-2">Loading notifications…</span>
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="card p-8 text-center text-on-surface-variant">
          No notifications yet. We'll let you know when something happens.
        </div>
      )}

      <div className="card divide-y divide-outline-variant/20">
        {list.map((n) => {
          const unread = !n.readAt;
          return (
            <div
              key={n.id}
              className={`p-4 flex items-start gap-3 ${unread ? 'bg-primary/5' : ''}`}
            >
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                unread ? 'bg-primary/20 text-primary' : 'bg-surface-low text-on-surface-variant'
              }`}>
                <Icon name={n.icon || 'notifications'} className="text-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-semibold text-sm ${unread ? '' : 'text-on-surface'}`}>
                    {n.title || n.type}
                  </span>
                  {unread && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                {n.body && (
                  <div className="text-sm text-on-surface-variant mt-0.5">{n.body}</div>
                )}
                <div className="text-label-sm text-on-surface-variant mt-1">
                  {timeAgo(n.createdAt)}
                  {n.link && (
                    <>
                      {' · '}
                      <Link to={n.link} className="text-primary hover:underline">View</Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}