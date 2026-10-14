import { Link, Outlet, useLocation } from 'react-router-dom';
import Icon from './Icon';

// Focused layout for auth and other "transaction" screens: brand mark,
// help, and the page — no bottom navigation.
export default function TransactionLayout({ children }) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-surface flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="flex items-center justify-between px-4 h-14 max-w-screen-md w-full mx-auto">
        <Link to="/home" className="flex items-center gap-2" aria-label="Yobou home">
          <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary-container to-primary text-white flex items-center justify-center font-black text-lg shadow-pop">Y</div>
          <span className="font-extrabold text-lg tracking-tight text-on-surface">Yobou</span>
        </Link>
        <Link to="/help" className="btn-icon text-on-surface-variant hover:bg-surface-high" aria-label="Help">
          <Icon name="help" className="text-[22px]" />
        </Link>
      </header>
      <main key={location.pathname} className="flex-1 max-w-screen-md w-full mx-auto px-4 pb-32 page-enter">
        {children || <Outlet />}
      </main>
    </div>
  );
}
