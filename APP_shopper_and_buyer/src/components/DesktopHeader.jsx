// Site header for laptop/desktop widths (lg and up). Phones use each
// page's own header plus the bottom tab bar (MobileShell), so this is
// hidden below lg.
//
//   ┌ service strip ─────────────────────────────── Help · Track order ┐
//   │ [Y] Yobou   [ search …………………………………… 📷 → ]   🔔  ♡  Orders  👤  🛍 │
//   │ ☰ All categories  Electronics  Fashion  Beauty …          % Deals │
//   └─────────────────────────────────────────────────────────────────┘
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from './Icon';
import CameraSearchButton from './CameraSearchButton';
import { useStore } from '../store';
import { useApi } from '../useApi.jsx';
import { useNotifications } from '../lib/useNotifications';
import { categoryPath } from '../lib/categoryTheme';

export const isGuestUser = (u) => !u || /@guest\.local$/i.test(u.email || '');

export default function DesktopHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const user = useStore((s) => s.user);
  const cartCount = useStore((s) => s.cartCount);
  const { unreadCount } = useNotifications(10);
  const catsApi = useApi('/api/products/categories');
  const cats = catsApi.data?.categories || [];

  // On the results page the box mirrors the current query.
  const urlQ = pathname === '/search' ? params.get('q') || '' : '';
  const [q, setQ] = useState(urlQ);
  useEffect(() => { setQ(urlQ); }, [urlQ]);

  const guest = isGuestUser(user);
  const firstName = !guest && user?.name ? user.name.split(' ')[0] : null;

  return (
    <header className="hidden lg:block sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-outline-variant/40">
      <div className="bg-primary text-white text-label-md">
        <div className="max-w-screen-xl mx-auto px-6 xl:px-8 h-8 flex items-center gap-6">
          <span className="flex items-center gap-1.5"><Icon name="local_shipping" className="text-[16px]" /> Free delivery over $50</span>
          <span className="flex items-center gap-1.5"><Icon name="payments" className="text-[16px]" /> Pay on delivery</span>
          <span className="flex items-center gap-1.5"><Icon name="verified_user" className="text-[16px]" /> 15-day returns</span>
          <span className="flex-1" />
          <Link to="/help" className="hover:underline">Help centre</Link>
          <Link to="/orders" className="hover:underline">Track your order</Link>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 xl:px-8 h-[72px] flex items-center gap-6">
        <Link to="/home" className="flex items-center gap-2 shrink-0" aria-label="Yobou home">
          <span className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-container to-primary text-white flex items-center justify-center font-black text-xl shadow-pop">Y</span>
          <span className="font-extrabold text-2xl tracking-tight text-on-surface">Yobou</span>
        </Link>

        <form
          role="search"
          className="relative flex-1 max-w-2xl"
          onSubmit={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}
        >
          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[22px]" />
          <input
            className="input rounded-full h-12 pl-12 pr-28 bg-surface-low border-outline-variant/50 shadow-none focus:bg-white"
            placeholder="Search products, brands and categories"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search products"
            enterKeyHint="search"
          />
          <CameraSearchButton className="absolute right-[3.75rem] top-1/2 -translate-y-1/2 w-10 h-10 rounded-full text-primary hover:bg-primary/10 flex items-center justify-center" />
          <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-4 rounded-full bg-primary text-white font-semibold text-sm flex items-center" aria-label="Search">
            <Icon name="arrow_forward" className="text-[20px]" />
          </button>
        </form>

        <nav aria-label="Account" className="flex items-center gap-1 shrink-0 ml-auto">
          <HeaderAction to="/notifications" icon="notifications" label="Alerts" count={unreadCount} />
          <HeaderAction to="/wishlist" icon="favorite" label="Wishlist" />
          <HeaderAction to="/orders" icon="receipt_long" label="Orders" />
          <HeaderAction to={guest ? '/login' : '/profile'} icon="person" label={firstName ? `Hi, ${firstName}` : 'Sign in'} />
          <Link to="/cart" className="ml-2 h-11 pl-3 pr-4 rounded-full bg-primary/10 text-primary hover:bg-primary/15 flex items-center gap-2 font-semibold" aria-label={`Cart, ${cartCount} items`}>
            <span className="relative">
              <Icon name="shopping_bag" fill className="text-[22px]" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-sale text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </span>
            Cart
          </Link>
        </nav>
      </div>

      <nav aria-label="Departments" className="max-w-screen-xl mx-auto px-6 xl:px-8 h-11 flex items-center gap-1 text-sm">
        <NavLink
          to="/categories"
          end
          className={({ isActive }) => `shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 font-semibold ${isActive ? 'bg-primary text-white' : 'bg-surface-low hover:bg-surface-high'}`}
        >
          <Icon name="menu" className="text-[18px]" /> All categories
        </NavLink>
        <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
          {cats.slice(0, 12).map((c) => (
            <NavLink
              key={c.name}
              to={categoryPath(c)}
              className={({ isActive }) => `shrink-0 h-8 px-3 rounded-full flex items-center font-medium whitespace-nowrap ${isActive ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-low'}`}
            >
              {c.name}
            </NavLink>
          ))}
        </div>
        <Link to="/search?showOnRecentDeals=true&sort=newest" className="shrink-0 h-8 px-3 rounded-full flex items-center gap-1 font-semibold text-sale hover:bg-sale/10">
          <Icon name="local_offer" className="text-[18px]" /> Deals
        </Link>
      </nav>
    </header>
  );
}

function HeaderAction({ to, icon, label, count = 0 }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `relative h-14 min-w-[64px] px-2 rounded-xl flex flex-col items-center justify-center gap-0.5 text-label-md ${isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-low'}`}
    >
      <span className="relative">
        <Icon name={icon} className="text-[24px]" />
        {count > 0 && (
          <span className="absolute -top-1 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-sale text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </span>
      <span className="max-w-[88px] truncate font-medium">{label}</span>
    </NavLink>
  );
}
