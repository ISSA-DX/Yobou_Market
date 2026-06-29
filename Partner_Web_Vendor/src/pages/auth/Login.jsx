import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useStore } from '../../store';
import Icon from '../../components/Icon';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const user = await login(email, password);
      // Route based on vendor status. PENDING vendors land on the
      // "awaiting approval" page; APPROVED vendors go to the dashboard.
      if (user.role !== 'VENDOR') {
        await useStore.getState().logout();
        setErr('This portal is for partners (vendors) only.');
        return;
      }
      if (user.vendor?.status === 'PENDING') {
        navigate('/onboarding-pending', { replace: true });
        return;
      }
      if (user.vendor?.status === 'REJECTED' || user.vendor?.status === 'SUSPENDED') {
        await useStore.getState().logout();
        setErr('Your vendor account is not active. Contact the Yobou team for help.');
        return;
      }
      const from = location.state?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true });
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-black text-lg">Y</div>
          <div>
            <div className="font-bold text-xl">Yobou Partner</div>
            <div className="text-label-md text-on-surface-variant">Vendor portal</div>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-headline-lg font-bold">Sign in</h1>
          <p className="mt-1 text-on-surface-variant text-sm">Manage your products, orders, and analytics.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-label-md text-on-surface-variant">Email</label>
              <input
                className="input mt-1"
                type="email"
                required
                autoFocus
                placeholder="vendor@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-label-md text-on-surface-variant">Password</label>
              <div className="relative mt-1">
                <input
                  className="input pr-10"
                  type={show ? 'text' : 'password'}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant"
                  aria-label="Show password"
                >
                  <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[20px]" />
                </button>
              </div>
            </div>

            {err && (
              <div className="text-error text-sm flex items-start gap-2">
                <Icon name="error" className="text-[18px] shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">
              {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Sign in
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-on-surface-variant">
            Not a partner yet?{' '}
            <Link to="/register" className="text-primary font-semibold">Apply to be a partner →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function humanizeError(e) {
  const code = e?.data?.error;
  const msg = e?.data?.message;
  if (code === 'CORS_BLOCKED') {
    return msg || "This portal is not allowed to reach the server. The operator must add this origin to CORS_ORIGIN.";
  }
  if (code === 'NETWORK_ERROR') return msg || 'Cannot reach the server. Check your internet connection.';
  if (code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect.';
  if (code === 'VENDOR_PENDING') return 'Your application is under review. We will email you once approved.';
  if (code === 'VENDOR_REJECTED') return 'Your vendor application was not accepted. Contact the Yobou team.';
  if (code === 'VENDOR_SUSPENDED') return 'Your vendor account is suspended. Contact the Yobou team.';
  if (code === 'ACCOUNT_DISABLED') return 'Your account is disabled. Contact the Yobou team.';
  if (e instanceof TypeError) {
    return 'Cannot reach the server. Check your internet connection, or contact the operator if this keeps happening.';
  }
  if (msg) return msg;
  return 'Something went wrong. Try again.';
}