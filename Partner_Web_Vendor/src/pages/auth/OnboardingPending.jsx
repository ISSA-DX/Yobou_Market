import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { api } from '../../api';
import Icon from '../../components/Icon';

// Landing page for vendors whose application is still being reviewed.
// Polls /api/auth/me every 60s to detect approval without forcing a
// page reload — the user just signs in, lands here, and is auto-redirected
// once the admin flips their status to APPROVED.
export default function OnboardingPending() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const refresh = useStore((s) => s.refresh);
  const logout = useStore((s) => s.logout);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const t = setInterval(async () => {
      if (!alive) return;
      try {
        const { user: fresh } = await api('/api/auth/me');
        if (!alive) return;
        if (fresh?.vendor?.status === 'APPROVED') {
          useStore.setState({ user: fresh });
          navigate('/dashboard', { replace: true });
        } else if (fresh?.vendor?.status === 'REJECTED' || fresh?.vendor?.status === 'SUSPENDED') {
          await logout();
          navigate('/login', { replace: true });
        }
      } catch {
        // ignore transient errors during poll
      }
    }, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [navigate, logout]);

  async function checkNow() {
    setError('');
    try {
      await refresh();
      const fresh = useStore.getState().user;
      if (fresh?.vendor?.status === 'APPROVED') {
        navigate('/dashboard', { replace: true });
      } else if (fresh?.vendor?.status === 'REJECTED') {
        await logout();
        navigate('/login', { replace: true });
      } else {
        setError('Still under review. We will email you once approved.');
      }
    } catch {
      setError('Could not check status right now. Try again in a moment.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-24 h-24 rounded-full bg-secondary/30 flex items-center justify-center relative">
          <Icon name="hourglass_top" className="text-secondary text-[44px]" />
        </div>
        <h1 className="mt-6 text-headline-lg font-bold">Your application is under review</h1>
        <p className="mt-2 text-on-surface-variant">
          Thanks for applying{user?.vendor?.businessName ? `, ${user.vendor.businessName}` : ''}!
          Our team reviews each application within 1-2 business days.
        </p>
        <p className="mt-1 text-on-surface-variant text-sm">
          We'll email <span className="font-semibold text-on-surface">{user?.email}</span> once your account is approved.
        </p>

        <div className="mt-8 space-y-3">
          <button onClick={checkNow} className="btn-primary w-full py-3">
            <Icon name="refresh" className="text-[18px]" /> Check status now
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} className="btn-secondary w-full py-3">
            Sign out
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-surface-low text-on-surface-variant text-sm">
            {error}
          </div>
        )}

        <div className="mt-10 p-4 rounded-lg bg-surface-low text-label-md text-on-surface-variant flex items-start gap-2 text-left">
          <Icon name="info" className="text-[18px]" />
          We auto-check your status every minute. Keep this page open in the background.
        </div>
      </div>
    </div>
  );
}