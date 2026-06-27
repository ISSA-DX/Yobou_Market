import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../api';
import Icon from './Icon';

function PendingBadges() {
  const [counts, setCounts] = useState({ changes: 0, refunds: 0 });
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
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
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
];

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
        <nav className="flex-1 space-y-1">
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
            <div className="flex items-center gap-3">
              <button onClick={toggleDark} className="md:hidden p-2 rounded-md hover:bg-surface-low">
                <Icon name={dark ? 'light_mode' : 'dark_mode'} className="text-[20px]" />
              </button>
              <div className="hidden md:flex items-center gap-3">
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