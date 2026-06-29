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
      // Honour the route the user was trying to reach, if any
      const from = location.state?.from?.pathname;
      if (from && from !== '/login') {
        navigate(from, { replace: true });
      } else if (user.role === 'ADMIN') navigate('/admin/dashboard');
      else navigate('/home');
    } catch (e) {
      setErr(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-md bg-primary text-white flex items-center justify-center font-black">Y</div>
          <span className="font-bold text-lg">Yobou Market</span>
        </div>
        <Link to="/help" className="p-2 rounded-full hover:bg-surface-low" aria-label="Help">
          <Icon name="help" className="text-[22px] text-on-surface-variant" />
        </Link>
      </div>

      <div className="card p-6">
        <h1 className="text-headline-lg font-bold">Welcome back</h1>
        <p className="mt-1 text-on-surface-variant">Sign in to continue shopping.</p>

        {/* Role switcher removed — this is the customer app. Vendors sign in
            via the standalone Yobou Partner app. */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-label-md text-on-surface-variant">Email</label>
            <input
              className="input mt-1"
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
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

          {err && <div className="text-error text-sm">{err}</div>}

          <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">
            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            Sign in
          </button>

          <div className="text-center">
            <Link to="#" className="text-sm text-primary font-medium">Forgot password?</Link>
          </div>
        </form>

        <div className="my-5 flex items-center gap-3 text-label-md text-on-surface-variant">
          <div className="flex-1 h-px bg-outline-variant/40" />
          OR CONTINUE WITH
          <div className="flex-1 h-px bg-outline-variant/40" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link to="/auth/google" className="btn-secondary py-3">
            <Icon name="account_circle" className="text-[20px]" />
            Google
          </Link>
          <Link to="/auth/apple" className="btn-secondary py-3">
            <Icon name="phone_iphone" className="text-[20px]" />
            Apple
          </Link>
        </div>

        <div className="mt-6 text-center text-sm text-on-surface-variant">
          New to Yobou?{' '}
          <Link to="/register" className="text-primary font-semibold">Sign up</Link>
        </div>
      </div>
    </div>
  );
}

function humanizeError(e) {
  // Prefer the server's human-readable `message` when available — it usually
  // names the actual cause ("Email or password is incorrect.", "Origin ... is
  // not allowed...", "User is gone") and is more useful than the code.
  const code = e?.data?.error;
  const msg = e?.data?.message;
  if (code === 'CORS_BLOCKED') {
    return msg || "This app is not allowed to reach the server. The operator must add this app's origin to CORS_ORIGIN.";
  }
  if (code === 'NETWORK_ERROR') return msg || 'Cannot reach the server. Check your internet connection.';
  if (code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect.';
  if (code === 'VENDOR_PENDING') return 'Your vendor account is awaiting admin approval.';
  if (code === 'VENDOR_REJECTED') return 'Your vendor application was rejected. Contact support.';
  if (code === 'EMAIL_TAKEN') return 'An account with that email already exists.';
  // Network-level failure (no `e.data`) — usually CORS preflight rejection or
  // the server being down. The TypeError is the browser's generic "Failed to
  // fetch" message.
  if (e instanceof TypeError) {
    return 'Cannot reach the server. Check your internet connection, or contact support if this keeps happening.';
  }
  if (msg) return msg;
  return 'Something went wrong. Try again.';
}