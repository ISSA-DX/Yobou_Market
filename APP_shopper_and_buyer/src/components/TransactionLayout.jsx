import { Link, Outlet } from 'react-router-dom';
import Icon from './Icon';

export default function TransactionLayout({ children }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="flex items-center justify-between px-4 h-14">
        <Link to="/home" className="flex items-center gap-1.5">
          <div className="w-8 h-8 rounded-md bg-primary text-white flex items-center justify-center font-black">Y</div>
          <span className="font-bold text-on-surface">Yobou</span>
        </Link>
        <Link to="/help" className="p-2 rounded-full hover:bg-surface-low" aria-label="Help">
          <Icon name="help" className="text-[22px] text-on-surface-variant" />
        </Link>
      </header>
      <main className="flex-1 max-w-screen-md w-full mx-auto px-4 pb-32">
        {children || <Outlet />}
      </main>
    </div>
  );
}
