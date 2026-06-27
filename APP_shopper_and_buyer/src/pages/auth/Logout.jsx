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
    <div className="py-12 text-center">
      <div className="mx-auto w-24 h-24 rounded-full bg-tertiary-container/30 flex items-center justify-center relative">
        <Icon name="logout" className="text-tertiary text-[40px]" />
        <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-tertiary text-white flex items-center justify-center border-4 border-surface">
          <Icon name="check" className="text-[18px]" />
        </div>
      </div>
      <h1 className="mt-6 text-headline-lg font-bold">You've been logged out</h1>
      <p className="mt-2 text-on-surface-variant">Your session has ended. Stay safe out there.</p>

      <div className="mt-8 space-y-3">
        <Link to="/login" className="btn-primary w-full py-3">Sign in again</Link>
        <Link to="/onboarding" className="btn-secondary w-full py-3">Continue as guest</Link>
      </div>

      <div className="mt-10 p-4 rounded-lg bg-surface-low text-label-md text-on-surface-variant flex items-start gap-2">
        <Icon name="shield" className="text-[18px]" />
        For your security, always sign out on shared devices.
      </div>

      <div className="mt-8 flex items-center justify-center gap-1 text-2xl">
        {['👍', '😊', '🤝', '❤️', '🛒'].map((e) => <span key={e}>{e}</span>)}
      </div>

      <div className="mt-10 flex items-center justify-center gap-4 opacity-60 text-label-md text-on-surface-variant">
        <span>Visa</span> · <span>MC</span> · <span>PayPal</span> · <span>Apple Pay</span>
      </div>
    </div>
  );
}
