import { Link, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon';

// Focused layout for auth and other "transaction" screens: brand mark,
// help, and the page — no bottom navigation or shop menus. On laptops the
// header spans the page like the main site header; sign-in pages sit in a
// narrow centred column, checkout in a medium one.
export default function TransactionLayout({ children }) {
  const location = useLocation();
  const checkout = location.pathname.startsWith('/checkout');
  return (
    <div className="min-h-screen bg-surface flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="w-full lg:border-b lg:border-outline-variant/40 lg:bg-white/70">
        <div className="flex items-center justify-between px-4 h-14 lg:h-16 max-w-screen-md lg:max-w-screen-xl lg:px-8 w-full mx-auto">
          <Link to="/home" className="flex items-center gap-2" aria-label="Yobou home">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary-container to-primary text-white flex items-center justify-center font-black text-lg shadow-pop">Y</div>
            <span className="font-extrabold text-lg lg:text-xl tracking-tight text-on-surface">Yobou</span>
          </Link>
          <div className="flex items-center gap-3">
            {checkout && (
              <span className="hidden lg:flex items-center gap-1.5 text-sm font-semibold text-tertiary">
                <Icon name="lock" className="text-[18px]" /> Secure checkout
              </span>
            )}
            <Link to="/help" className="btn-icon text-on-surface-variant hover:bg-surface-high" aria-label="Help">
              <Icon name="help" className="text-[22px]" />
            </Link>
          </div>
        </div>
      </header>
      <main key={location.pathname} className={`flex-1 w-full mx-auto px-4 pb-32 page-enter ${checkout ? 'max-w-screen-md lg:pt-4' : 'max-w-screen-md lg:max-w-lg lg:pt-8'}`}>
        {children || <Outlet />}
      </main>
    </div>
  );
}
