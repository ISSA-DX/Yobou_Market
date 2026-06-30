import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { api } from '../../api';
import { useApi, RetryError } from '../../useApi.jsx';
import { toast } from '../../lib/toast';

const SECTIONS = [
  {
    title: 'Account',
    items: [
      { icon: 'pin_drop', label: 'Addresses', to: '/profile/addresses' },
      { icon: 'credit_card', label: 'Payment methods', to: '/profile/cards' },
    ],
  },
  {
    title: 'Shopping',
    items: [
      { icon: 'favorite', label: 'Wishlist', to: '/wishlist' },
      { icon: 'rate_review', label: 'My reviews', to: '/profile' },
      { icon: 'receipt_long', label: 'Order history', to: '/orders' },
    ],
  },
  {
    title: 'Preferences',
    items: [
      { icon: 'settings', label: 'Preferences', to: '/profile/preferences' },
      { icon: 'help', label: 'Help & support', to: '/help' },
    ],
  },
];

export default function Profile() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const updateProfile = useStore((s) => s.updateProfile);
  const wishlist = useStore((s) => s.wishlist);
  const logout = useStore((s) => s.logout);
  const toggleDark = useStore((s) => s.toggleDark);
  const dark = useStore((s) => s.dark);
  const { data, error, refetch } = useApi('/api/orders');
  const { data: addrData } = useApi('/api/addresses');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (user) setForm({ name: user.name || '', email: user.email || '' });
  }, [user]);

  const orders = data?.orders || [];
  const addresses = addrData?.addresses || [];
  const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const updated = await updateProfile(form);
      setUser(updated);
      setEditing(false);
      toast.success('Profile saved');
    } catch (e) {
      const msg = e.message === 'EMAIL_TAKEN' ? 'That email is already in use.' : 'Could not save profile.';
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/logout');
  }

  if (error && !data) {
    return <RetryError message="Couldn't load your profile." onRetry={refetch} />;
  }

  return (
    <div className="pb-24 max-w-screen-md mx-auto">
      <header className="flex items-center justify-between px-4 h-14">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold">Profile</h1>
        <span className="w-10" />
      </header>

      <div className="px-4 space-y-6">
        {/* Avatar */}
        <div className="text-center">
          <div className="relative inline-block">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary-container text-white flex items-center justify-center text-headline-lg font-bold shadow-float">
              {(form.name || user?.name || 'U').slice(0, 2).toUpperCase()}
            </div>
            <button
              onClick={() => setEditing((v) => !v)}
              className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-white shadow-card flex items-center justify-center text-primary hover:bg-surface-low"
              aria-label={editing ? 'Cancel editing' : 'Edit profile'}
            >
              <Icon name={editing ? 'close' : 'edit'} className="text-[16px]" />
            </button>
          </div>
          <h2 className="mt-3 text-headline-md font-bold">{user?.name}</h2>
          <div className="text-label-md text-on-surface-variant">{user?.email}</div>
        </div>

        {/* Editable profile card */}
        <div className="card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-title-lg font-semibold">Personal info</h3>
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-primary text-sm font-semibold flex items-center gap-1">
                <Icon name="edit" className="text-[16px]" /> Edit
              </button>
            )}
          </div>

          {editing ? (
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="text-label-md text-on-surface-variant">Full name</label>
                <input
                  className="input mt-1"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  minLength={1}
                  maxLength={120}
                />
              </div>
              <div>
                <label className="text-label-md text-on-surface-variant">Email</label>
                <input
                  type="email"
                  className="input mt-1"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              {err && <div className="text-error text-sm">{err}</div>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1 py-2.5" disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1 py-2.5" disabled={busy}>
                  {busy ? <Icon name="progress_activity" className="text-[18px] animate-spin" /> : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-outline-variant/20">
                <span className="text-on-surface-variant text-sm">Name</span>
                <span className="font-medium text-sm text-right">{user?.name}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-outline-variant/20">
                <span className="text-on-surface-variant text-sm">Email</span>
                <span className="font-medium text-sm text-right break-all">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-on-surface-variant text-sm">Role</span>
                <span className="font-medium text-sm capitalize">{user?.role?.toLowerCase()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/orders" className="card p-4 text-center hover:shadow-float transition">
            <Icon name="receipt_long" className="text-primary text-[24px] mx-auto" />
            <div className="mt-1 text-headline-md font-bold">{orders.length}</div>
            <div className="text-label-md text-on-surface-variant">Orders</div>
          </Link>
          <Link to="/wishlist" className="card p-4 text-center hover:shadow-float transition">
            <Icon name="favorite" className="text-tertiary text-[24px] mx-auto" />
            <div className="mt-1 text-headline-md font-bold">{wishlist.length}</div>
            <div className="text-label-md text-on-surface-variant">Wishlist</div>
          </Link>
        </div>

        {/* Default address */}
        {defaultAddr && (
          <div className="card p-4">
            <div className="flex items-center gap-2 text-label-md text-on-surface-variant">
              <Icon name="home" className="text-[16px]" /> Default address
            </div>
            <div className="mt-1 font-semibold text-sm">
              {defaultAddr.recipientName || defaultAddr.line1}
            </div>
            <div className="text-label-md text-on-surface-variant">
              {defaultAddr.line1}, {defaultAddr.city}, {defaultAddr.state} {defaultAddr.postal}
            </div>
          </div>
        )}

        {/* Sections */}
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="card overflow-hidden">
            <div className="px-4 pt-3 pb-1 text-label-md text-on-surface-variant uppercase tracking-wide">{sec.title}</div>
            <ul>
              {sec.items.map((it, idx) => (
                <li key={it.label}>
                  <Link to={it.to} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-low transition">
                    <Icon name={it.icon} className="text-on-surface-variant" />
                    <span className="flex-1">{it.label}</span>
                    <Icon name="chevron_right" className="text-on-surface-variant text-[20px]" />
                  </Link>
                  {idx < sec.items.length - 1 && <div className="ml-12 h-px bg-outline-variant/20" />}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Theme toggle */}
        <button onClick={toggleDark} className="w-full card p-4 flex items-center gap-3 hover:bg-surface-low transition">
          <Icon name={dark ? 'light_mode' : 'dark_mode'} />
          <span className="flex-1 text-left font-medium">Theme: {dark ? 'Dark' : 'Light'}</span>
          <Icon name="chevron_right" className="text-on-surface-variant" />
        </button>

        <button onClick={handleLogout} className="w-full text-error font-semibold py-3 rounded-md hover:bg-error/10 transition">
          Log out
        </button>

        <div className="text-center text-label-md text-on-surface-variant pb-4">
          Yobou v1.0.0 · <Link to="#" className="text-primary">Terms</Link> · <Link to="#" className="text-primary">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
