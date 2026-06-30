import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../api';
import { useNotifications } from '../lib/useNotifications';
import { useNotificationStream } from '../lib/useSse';
import Icon from './Icon';

// PendingBadges — counts for the sidebar (Changes / Refunds).
//
// Exposes a refresh trigger via a singleton ref so the SSE notification
// handler (see NotificationBell below) can refetch the counts the moment
// a `product_change_submitted` or refund-related notification arrives —
// without waiting for the 30s poll. The poll is the fallback for cases
// where the SSE connection is throttled (background tab) or the server
// missed the event for any reason.
const countsRefreshBus = { current: null };
function PendingBadges() {
  const [counts, setCounts] = useState({ changes: 0, refunds: 0 });
  const loadRef = useRef(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [c, r] = await Promise.all([
          api('/api/product-changes?status=PENDING'),
          api('/api/refunds?status=PENDING'),
        ]);
        if (!alive) return;
        setCounts({
          changes: c.changes?.length || 0,
          refunds: r.refunds?.length || 0,
        });
      } catch {
        // Non-admin (e.g. before login) won't have access — ignore.
      }
    }
    loadRef.current = load;
    countsRefreshBus.current = () => load();
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
      if (countsRefreshBus.current === load) countsRefreshBus.current = null;
      loadRef.current = null;
    };
  }, []);
  return counts;
}

function NavItem({ to, label, icon, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium ${
          isActive ? 'bg-surface-high text-primary' : 'text-on-surface-variant hover:bg-surface-low'
        }`
      }
    >
      <Icon name={icon} className="text-[20px]" />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="px-2 py-0.5 rounded-full bg-secondary text-on-secondary text-label-sm font-bold">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { to: '/products', label: 'Products', icon: 'inventory_2' },
  { to: '/changes', label: 'Changes', icon: 'pending_actions', badgeKey: 'changes' },
  { to: '/refunds', label: 'Refunds', icon: 'assignment_return', badgeKey: 'refunds' },
  { to: '/vendors', label: 'Vendors', icon: 'storefront' },
  { to: '/orders', label: 'Orders', icon: 'receipt_long' },
  { to: '/users', label: 'Users', icon: 'group' },
  { to: '/broadcast', label: 'Broadcast', icon: 'campaign' },
  { to: '/audit', label: 'Audit log', icon: 'fact_check' },
];

function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(10);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // When a notification that affects the sidebar counts arrives, refresh
  // the PendingBadges bus synchronously. The bell already increments
  // its own badge via useNotifications, but the sidebar Changes/Refunds
  // counts are owned by a separate poller — without this hook they'd
  // lag by up to 30 seconds.
  useNotificationStream((note) => {
    if (!note || !note.kind) return;
    if (note.kind === 'product_change_submitted' || note.kind === 'refund_requested') {
      countsRefreshBus.current?.();
    }
  });

  function handleClick(note) {
    markRead(note.id);
    setOpen(false);
    if (note.link) navigate(note.link);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-surface-low"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Icon name="notifications" className="text-[22px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[11px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-outline-variant/30 z-30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-outline-variant/30">
              <div className="font-semibold text-sm">Notifications</div>
              {unreadCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-on-surface-variant text-sm">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 border-b border-outline-variant/20 hover:bg-surface-low ${
                      !n.readAt ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{n.title}</div>
                        <div className="text-xs text-on-surface-variant line-clamp-2">{n.body}</div>
                        <div className="text-[11px] text-on-surface-variant/70 mt-1">
                          {new Date(n.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminShell() {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const toggleDark = useStore((s) => s.toggleDark);
  const dark = useStore((s) => s.dark);
  const navigate = useNavigate();
  const counts = PendingBadges();

  async function handleLogout() {
    await logout();
    navigate('/logout');
  }

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-outline-variant/30 p-4">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center font-black">Y</div>
          <div>
            <div className="font-bold text-on-surface">Yobou</div>
            <div className="text-label-sm text-on-surface-variant">Admin portal</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((it) => (
            <NavItem
              key={it.to}
              to={it.to}
              label={it.label}
              icon={it.icon}
              badge={it.badgeKey ? counts[it.badgeKey] : 0}
            />
          ))}
        </nav>
        <div className="border-t border-outline-variant/30 pt-3 space-y-1">
          <button
            onClick={toggleDark}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-on-surface-variant hover:bg-surface-low"
          >
            <Icon name={dark ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
            {dark ? 'Light' : 'Dark'} mode
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-on-surface-variant hover:bg-surface-low"
          >
            <Icon name="logout" className="text-[20px]" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-outline-variant/30">
          <div className="flex items-center justify-between px-4 md:px-8 h-16">
            <div className="md:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary text-white flex items-center justify-center font-black">Y</div>
              <div className="font-bold">Yobou <span className="text-on-surface-variant text-xs font-normal">/ Admin</span></div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-on-surface-variant text-sm">
              <Icon name="admin_panel_settings" className="text-[20px]" />
              <span>Management portal</span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button onClick={toggleDark} className="md:hidden p-2 rounded-md hover:bg-surface-low">
                <Icon name={dark ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
              </button>
              <div className="hidden md:flex items-center gap-3 pl-2">
                <div className="text-right">
                  <div className="text-sm font-semibold">{user?.name}</div>
                  <div className="text-label-sm text-on-surface-variant">{user?.email}</div>
                </div>
                <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                  {user?.name?.[0] || 'A'}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-screen-2xl w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}