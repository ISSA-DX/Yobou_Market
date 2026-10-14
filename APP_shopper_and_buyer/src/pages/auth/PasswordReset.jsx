// Forgot / reset password screens. Kept in sync across
// APP_shopper_and_buyer, Partner_Web_Vendor and Internal_Web_Admin.
//
//   /forgot-password           → POST /api/auth/forgot-password { email }
//   /reset-password?token=…    → POST /api/auth/reset-password { token, password }
//
// The emailed link always opens the app that matches the account's role
// (server/src/lib/appUrls.js), so each app only needs these two routes.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';

function Shell({ title, subtitle, children }) {
  return (
    <div className="w-full max-w-md mx-auto py-6">
      <div className="reveal reveal-zoom card p-6">
        <h1 className="text-headline-lg font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-on-surface-variant text-sm">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: email.trim() }, auth: false });
      setSent(true);
    } catch (e2) {
      setErr(e2?.data?.error === 'RATE_LIMITED'
        ? 'Too many requests. Please wait a few minutes and try again.'
        : 'Could not send the email. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Shell title="Check your email">
        <div className="flex gap-3 text-sm">
          <Icon name="mark_email_read" className="text-primary text-[28px] shrink-0" />
          <p>
            If an account exists for <strong>{email}</strong>, we sent a link to choose a new password.
            It expires in 30 minutes. Check your spam folder if you don&apos;t see it.
          </p>
        </div>
        <Link to="/login" className="btn-primary w-full py-3 mt-6">Back to sign in</Link>
      </Shell>
    );
  }

  return (
    <Shell title="Forgot your password?" subtitle="Enter your account email and we'll send you a reset link.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Email</span>
          <input className="input mt-1" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        {err && <div className="text-error text-sm">{err}</div>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">
          {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
          Send reset link
        </button>
        <div className="text-center">
          <Link to="/login" className="text-sm text-primary font-medium">Back to sign in</Link>
        </div>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) return;
    setBusy(true); setErr('');
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
      setDone(true);
    } catch (e2) {
      const code = e2?.data?.error;
      setErr(code === 'RESET_TOKEN_INVALID'
        ? 'This link has expired or was already used. Request a new one.'
        : code === 'RATE_LIMITED' ? 'Too many attempts. Please wait a few minutes.'
          : 'Could not reset your password. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Shell title="Invalid link" subtitle="This reset link is incomplete.">
        <Link to="/forgot-password" className="btn-primary w-full py-3">Request a new link</Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell title="Password updated">
        <div className="flex gap-3 text-sm">
          <Icon name="check_circle" className="text-tertiary text-[28px] shrink-0" />
          <p>Your password was changed and you were signed out of your other devices. Sign in with your new password.</p>
        </div>
        <button onClick={() => navigate('/login', { replace: true })} className="btn-primary w-full py-3 mt-6">Sign in</button>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password" subtitle="At least 8 characters. Mix letters, numbers and symbols for a stronger password.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-label-md text-on-surface-variant">New password</span>
          <div className="relative mt-1">
            <input
              className="input pr-10"
              type={show ? 'text' : 'password'}
              required
              minLength={8}
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant" aria-label="Show password">
              <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[20px]" />
            </button>
          </div>
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Confirm new password</span>
          <input
            className="input mt-1"
            type={show ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {mismatch && <div className="text-error text-sm">The passwords don&apos;t match.</div>}
        {err && (
          <div className="text-error text-sm">
            {err}{' '}
            {err.includes('expired') && <Link to="/forgot-password" className="text-primary font-semibold">New link</Link>}
          </div>
        )}
        <button type="submit" disabled={busy || mismatch || password.length < 8} className="btn-primary w-full py-3 disabled:opacity-60">
          {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
          Update password
        </button>
      </form>
    </Shell>
  );
}
