import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useNotifications } from '../lib/useNotifications';

// Icon + tint per notification kind, so the inbox scans at a glance.
const KIND = {
  order_placed: ['shopping_bag', 'bg-primary/10 text-primary'],
  order_status: ['local_shipping', 'bg-primary/10 text-primary'],
  tracking_updated: ['two_wheeler', 'bg-amber-50 text-amber-600'],
  order_cancelled: ['block', 'bg-rose-50 text-rose-600'],
  admin_broadcast: ['campaign', 'bg-emerald-50 text-emerald-700'],
  product_created: ['new_releases', 'bg-emerald-50 text-emerald-700'],
  product_updated: ['sell', 'bg-primary/10 text-primary'],
};

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

function dayGroup(iso) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return 'Earlier';
}

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(50);

  function handleClick(note) {
    markRead(note.id);
    if (note.link) navigate(note.link);
  }

  const groups = ['Today', 'Yesterday', 'Earlier']
    .map((g) => [g, notifications.filter((n) => dayGroup(n.createdAt) === g)])
    .filter(([, list]) => list.length > 0);

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <header className="reveal reveal-fade-down flex items-center gap-2">
        <Link to="/home" className="btn-icon -ml-2" aria-label="Back"><Icon name="arrow_back" className="text-[24px]" /></Link>
        <div className="flex-1">
          <h1 className="page-title">Notifications</h1>
          <p className="text-label-md text-on-surface-variant">
            {unreadCount > 0 ? `${unreadCount} unread` : 'You’re all caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button type="button" onClick={markAllRead} className="btn-ghost btn-sm">
            <Icon name="done_all" className="text-[18px]" /> Mark all read
          </button>
        )}
      </header>

      {notifications.length === 0 && (
        <div className="reveal reveal-pop text-center py-14">
          <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="notifications" className="text-[44px] text-primary" />
          </div>
          <h2 className="mt-5 section-title">No notifications yet</h2>
          <p className="mt-1.5 text-sm text-on-surface-variant">Order updates, delivery news and deals will show up here.</p>
        </div>
      )}

      {groups.map(([label, list]) => (
        <section key={label} className="space-y-2">
          <h2 className="eyebrow px-1">{label}</h2>
          <ul className="reveal-stagger stagger-left card divide-y divide-outline-variant/40 overflow-hidden">
            {list.map((n) => {
              const [icon, tint] = KIND[n.kind] || ['notifications', 'bg-surface-high text-on-surface-variant'];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition hover:bg-surface-low ${!n.readAt ? 'bg-primary/[0.04]' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tint}`}>
                      <Icon name={icon} className="text-[20px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm line-clamp-1 flex-1 ${!n.readAt ? 'font-bold' : 'font-medium'}`}>{n.title}</span>
                        <span className="text-label-sm text-on-surface-variant whitespace-nowrap">{ago(n.createdAt)}</span>
                      </div>
                      <div className="text-sm text-on-surface-variant line-clamp-2">{n.body}</div>
                    </div>
                    {!n.readAt && <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
