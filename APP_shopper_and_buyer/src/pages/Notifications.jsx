import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useNotifications } from '../lib/useNotifications';

export default function Notifications() {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(50);

  function handleClick(note) {
    markRead(note.id);
    if (note.link) navigate(note.link);
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-headline-lg font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-primary font-semibold text-sm">
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 && (
        <div className="card p-8 text-center text-on-surface-variant text-sm">
          No notifications yet.
        </div>
      )}

      <ul className="space-y-2">
        {notifications.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => handleClick(n)}
              className={`w-full text-left card p-4 hover:bg-surface-low ${
                !n.readAt ? 'bg-primary/5' : ''
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.readAt && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{n.title}</div>
                  <div className="text-sm text-on-surface-variant line-clamp-2">{n.body}</div>
                  <div className="text-label-sm text-on-surface-variant/70 mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                <Icon name="chevron_right" className="text-[20px] text-on-surface-variant mt-1" />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}