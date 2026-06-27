import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../../store';
import Icon from '../../components/Icon';

export default function Register() {
  const navigate = useNavigate();
  const register = useStore((s) => s.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await register({ name, email, password });
      navigate('/home');
    } catch (e) {
      setErr(humanizeError(e.data?.error));
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
        <h1 className="text-headline-lg font-bold">Create account</h1>
        <p className="mt-1 text-on-surface-variant">Join Yobou and start shopping today.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-label-md text-on-surface-variant">Full name</label>
            <input
              className="input mt-1"
              type="text"
              required
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Email</label>
            <input
              className="input mt-1"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Password (min 8 chars)</label>
            <div className="relative mt-1">
              <input
                className="input pr-10"
                type={show ? 'text' : 'password'}
                required
                minLength={8}
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
            Create account
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-on-surface-variant">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-semibold">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

function humanizeError(code) {
  switch (code) {
    case 'EMAIL_TAKEN': return 'An account with that email already exists.';
    case 'INVALID_INPUT': return 'Please check your details and try again.';
    default: return 'Something went wrong. Try again.';
  }
}
