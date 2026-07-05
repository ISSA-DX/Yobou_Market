import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import Icon from './Icon';
import { useNotifications } from '../lib/useNotifications';

const NAV = [
  { to: '/home', label: 'Home', icon: 'home' },
  { to: '/categories', label: 'Categories', icon: 'grid_view' },
  { to: '/cart', label: 'Cart', icon: 'shopping_bag' },
  { to: '/orders', label: 'Orders', icon: 'receipt_long' },
  { to: '/profile', label: 'Profile', icon: 'person' },
];

export default function MobileShell() {
  const user = useStore((s) => s.user);
  const cartCount = useStore((s) => s.cartCount);
  const refreshCart = useStore((s) => s.refreshCartCount);

  // Refresh cart once per user change — never during render.
  useEffect(() => {
    if (user) refreshCart();
  }, [user, refreshCart]);

  return (
    <div className="min-h-screen bg-surface" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      {/* Top bar — adds iOS/notch top safe-area padding so the bar sits
          below the device notch and never gets clipped by the status bar. */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-outline-variant/30">
        <div
          className="max-w-screen-md mx-auto flex items-center justify-end px-4"
          style={{ height: 'calc(3rem + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
        >
          {/* Y+ 'Yobou' wordmark removed from the persistent top bar.
              The Home page's hero card carries 'Welcome to Yobou'
              which acts as the page-level identifier; on every other
              page the bottom-nav (Home / Categories / Cart / Orders
              / Profile) is the navigational chrome. Repeating the
              wordmark on every screen was visual noise eating
              vertical real estate. BellLink keeps its right slot. */}
          <BellLink />
        </div>
      </header>
      <div className="max-w-screen-md mx-auto">
        <Outlet />
      </div>
      <nav
        className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-outline-variant/30 shadow-float z-30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-screen-md mx-auto grid grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2.5 text-label-sm ${
                  isActive ? 'text-primary' : 'text-on-surface-variant'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative">
                    <Icon name={item.icon} fill={isActive} className="text-[24px]" />
                    {item.to === '/cart' && cartCount > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function BellLink() {
  const { unreadCount } = useNotifications(10);
  return (
    <NavLink
      to="/notifications"
      className="relative p-2 rounded-md hover:bg-surface-low"
      aria-label={`Notifications (${unreadCount} unread)`}
    >
      <Icon name="notifications" className="text-[22px] text-on-surface-variant" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[11px] font-bold flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </NavLink>
  );
}