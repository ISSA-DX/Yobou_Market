import { useEffect, useMemo } from 'react';
import { Link, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import Icon from './Icon';
import { useNotifications } from '../lib/useNotifications';
import { useApi } from '../useApi.jsx';
import NetworkStatus from './NetworkStatus';

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

  // Memoize the address request config so useApi doesn't re-run every render.
  const addressOpts = useMemo(() => ({ skip: !user }), [user]);
  const { data: addressData, loading: addressesLoading } = useApi('/api/addresses', addressOpts);
  const addresses = addressData?.addresses || [];

  // Refresh cart once per user change — never during render.
  useEffect(() => {
    if (user) refreshCart();
  }, [user, refreshCart]);

  return (
    <div className="min-h-screen bg-surface pb-20">
      <NetworkStatus />
      {/* Amazon-style sticky header: location row + brand/search/actions row. */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-outline-variant/30">
        <div className="max-w-screen-md mx-auto px-4 pt-2 pb-2.5 space-y-1.5">
          {/* Top row — delivery location + quick actions. */}
          <div className="flex items-center justify-between gap-3">
            <LocationLine addresses={addresses} addressesLoading={addressesLoading} user={user} />
            <div className="flex items-center gap-0.5">
              <BellLink />
              <CartLink count={cartCount} />
            </div>
          </div>

          {/* Bottom row — brand + pill search. */}
          <div className="flex items-center gap-2.5">
            <Link to="/home" className="flex items-center gap-1.5 shrink-0" aria-label="Yobou home">
              <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-black text-sm shadow-sm">Y</div>
              <span className="font-bold text-base tracking-tight">Yobou</span>
            </Link>

            <SearchPill />
          </div>
        </div>
      </header>

      <main className="max-w-screen-md mx-auto">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-outline-variant/30 shadow-float z-30">
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
                      <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
                        {cartCount > 99 ? '99+' : cartCount}
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

function SearchPill() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 min-w-0">
      <button
        type="button"
        onClick={() => navigate('/search')}
        className="w-full h-10 pl-3 pr-2 rounded-full bg-surface-low border border-outline-variant/40 flex items-center gap-2 text-on-surface-variant text-sm transition hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary text-left"
      >
        <Icon name="search" className="text-[20px] shrink-0" />
        <span className="truncate flex-1">Search products, brands…</span>
        <span
          className="p-1 rounded-full hover:bg-surface-high transition"
          aria-hidden="true"
          onClick={(e) => {
            e.stopPropagation();
            // Future: voice search.
          }}
        >
          <Icon name="mic" className="text-[20px]" />
        </span>
      </button>
    </div>
  );
}

function LocationLine({ addresses, addressesLoading, user }) {
  const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
  const firstName = user?.name?.split(' ')[0];

  let label = `Deliver to ${firstName || 'you'}`;
  if (addressesLoading) label = 'Locating…';
  else if (defaultAddr?.city) label += ` — ${defaultAddr.city}`;
  else if (addresses.length === 0) label += ' — Add address';

  return (
    <Link
      to="/profile/addresses"
      className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-on-surface hover:text-primary transition min-w-0"
      aria-label="Choose delivery address"
    >
      <Icon name="location_on" className="text-[16px] text-primary shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function CartLink({ count }) {
  return (
    <NavLink
      to="/cart"
      className="relative p-2 rounded-md hover:bg-surface-low transition"
      aria-label={`Cart, ${count} items`}
    >
      <Icon name="shopping_cart" className="text-[22px] text-on-surface-variant" />
      {count > 0 && (
        <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}

function BellLink() {
  const { unreadCount } = useNotifications(10);
  return (
    <NavLink
      to="/notifications"
      className="relative p-2 rounded-md hover:bg-surface-low transition"
      aria-label={`Notifications, ${unreadCount} unread`}
    >
      <Icon name="notifications" className="text-[22px] text-on-surface-variant" />
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </NavLink>
  );
}
