import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../store';
import Icon from '../../components/Icon';

export default function Logout() {
  const logout = useStore((s) => s.logout);

  useEffect(() => {
    logout();
  }, [logout]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-24 h-24 rounded-full bg-tertiary-container/30 flex items-center justify-center relative">
          <Icon name="logout" className="text-tertiary text-[40px]" />
          <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-tertiary text-white flex items-center justify-center border-4 border-surface">
            <Icon name="check" className="text-[18px]" />
          </div>
        </div>
        <h1 className="mt-6 text-headline-lg font-bold">You've been logged out</h1>
        <p className="mt-2 text-on-surface-variant">Your admin session has ended.</p>

        <div className="mt-8 space-y-3">
          <Link to="/login" className="btn-primary w-full py-3">Sign in again</Link>
        </div>

        <div className="mt-10 p-4 rounded-lg bg-surface-low text-label-md text-on-surface-variant flex items-start gap-2 text-left">
          <Icon name="shield" className="text-[18px]" />
          For your security, always sign out on shared devices.
        </div>
      </div>
    </div>
  );
}