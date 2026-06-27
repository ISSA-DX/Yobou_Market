import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import Icon from './Icon';

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
  const logout = useStore((s) => s.logout);
  const refreshCart = useStore((s) => s.refreshCartCount);
  const navigate = useNavigate();

  // Refresh cart once per user change — never during render.
  useEffect(() => {
    if (user) refreshCart();
  }, [user, refreshCart]);

  async function handleLogout() {
    await logout();
    navigate('/logout');
  }

  return (
    <div className="min-h-screen bg-surface pb-20">
      <div className="max-w-screen-md mx-auto">
        <Outlet />
      </div>
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