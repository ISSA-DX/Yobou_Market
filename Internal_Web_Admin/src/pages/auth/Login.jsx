import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
      if (user.role !== 'ADMIN') {
        // This portal is admin-only. Bounce non-admins immediately.
        await useStore.getState().logout();
        setErr('This portal is for administrators only.');
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
            <div className="font-bold text-xl">Yobou Admin</div>
            <div className="text-label-md text-on-surface-variant">Management portal</div>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-headline-lg font-bold">Sign in</h1>
          <p className="mt-1 text-on-surface-variant text-sm">Administrator access only.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-label-md text-on-surface-variant">Email</label>
              <input
                className="input mt-1"
                type="email"
                required
                autoFocus
                placeholder="admin@yobou.test"
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
        </div>

        <p className="mt-4 text-center text-label-md text-on-surface-variant">
          Demo: admin@yobou.test / Admin123!
        </p>
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
    return msg || "This portal is not allowed to reach the server. The operator must add this origin to CORS_ORIGIN.";
  }
  if (code === 'NETWORK_ERROR') return msg || 'Cannot reach the server. Check your internet connection.';
  if (code === 'INVALID_CREDENTIALS') return 'Email or password is incorrect.';
  if (code === 'VENDOR_PENDING' || code === 'VENDOR_REJECTED') return 'This portal is for administrators only.';
  if (e instanceof TypeError) {
    return 'Cannot reach the server. Check your internet connection, or contact the operator if this keeps happening.';
  }
  if (msg) return msg;
  return 'Something went wrong. Try again.';
}