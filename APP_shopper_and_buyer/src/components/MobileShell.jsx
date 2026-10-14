import { useEffect, useRef } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { replayAnimation } from '../lib/motion';
import { useStore } from '../store';
import Icon from './Icon';
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
  // Bump the cart badge whenever the count goes up.
  const badgeRef = useRef(null);
  const prevCount = useRef(cartCount);
  useEffect(() => {
    if (cartCount > prevCount.current) replayAnimation(badgeRef.current, 'anim-bump');
    prevCount.current = cartCount;
  }, [cartCount]);

  // Refresh cart once per user change — never during render.
  useEffect(() => {
    if (user) refreshCart();
  }, [user, refreshCart]);

  return (
    <div
      className="min-h-screen bg-surface"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
    >
      <NetworkStatus />
      {/* No global top bar: every page owns its header (Home carries the
          brand, search, notifications and cart; inner pages a back
          button + title). The old bell-only strip duplicated Home's
          bell and cost ~50px on every screen. */}
      {/* No page-wide fade here: opacity < 1 on this wrapper would make it a
          stacking context, letting the bottom nav cover pages' own fixed
          action bars (product "Add to cart") during the fade. Each page's
          sections animate in on their own (styles/motion.css). */}
      <div className="max-w-screen-md mx-auto">
        <Outlet />
      </div>
      <nav
        className="fixed bottom-0 inset-x-0 bg-white border-t border-outline-variant/50 shadow-nav z-30"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-screen-md mx-auto grid grid-cols-5 px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 pt-2 pb-2.5 text-label-sm transition-colors ${
                  isActive ? 'text-primary' : 'text-on-surface-variant'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`relative flex items-center justify-center w-14 h-8 rounded-full transition-colors ${isActive ? 'bg-primary/10' : ''}`}>
                    <Icon name={item.icon} fill={isActive} className="text-[22px]" />
                    {item.to === '/cart' && cartCount > 0 && (
                      <span ref={badgeRef} className="absolute -top-1 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-sale text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                        {cartCount > 99 ? '99+' : cartCount}
                      </span>
                    )}
                  </div>
                  <span className={isActive ? 'font-bold' : 'font-medium'}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
