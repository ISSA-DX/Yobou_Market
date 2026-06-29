import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { useStore } from '../../store';
import { toast } from '../../lib/toast';

const SUGGESTED_CATEGORIES = [
  'Electronics', 'Fashion', 'Home', 'Beauty', 'Grocery',
  'Sports', 'Toys', 'Books', 'Health', 'Auto',
];

export default function Profile() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const profileApi = useApi('/api/vendors/me');

  const [form, setForm] = useState({
    businessName: '',
    phone: '',
    licenseUrl: '',
    categories: [],
    logoUrl: '',
    bannerUrl: '',
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Image upload state — shared between logo and banner.
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const logoInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [pwOk, setPwOk] = useState('');

  const [prefs, setPrefs] = useState({
    notifyOrderUpdates: true,
    notifyShipping: true,
    notifyPromotions: false,
  });
  const [prefsBusy, setPrefsBusy] = useState(false);

  useEffect(() => {
    if (profileApi.data?.vendor) {
      const v = profileApi.data.vendor;
      setForm({
        businessName: v.businessName || '',
        phone: v.phone || '',
        licenseUrl: v.licenseUrl || '',
        categories: Array.isArray(v.categories) ? v.categories : [],
        logoUrl: v.logoUrl || '',
        bannerUrl: v.bannerUrl || '',
      });
    }
    if (user) {
      setPrefs({
        notifyOrderUpdates: user.notifyOrderUpdates ?? true,
        notifyShipping: user.notifyShipping ?? true,
        notifyPromotions: user.notifyPromotions ?? false,
      });
    }
  }, [profileApi.data, user]);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function toggleCategory(cat) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat],
    }));
  }

  async function saveProfile() {
    setBusy(true);
    setErr('');
    try {
      await api('/api/vendors/me', { method: 'PATCH', body: form });
      toast.success('Business profile updated');
      setSaved(true);
      profileApi.refetch();
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file, kind) {
    if (!file) return;
    if (kind === 'logo') setUploadingLogo(true); else setUploadingBanner(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api('/api/products/upload', { method: 'POST', body: fd });
      if (res?.url) {
        update(kind === 'logo' ? 'logoUrl' : 'bannerUrl', res.url);
        toast.success(`${kind === 'logo' ? 'Logo' : 'Banner'} uploaded`);
      }
    } catch (e) {
      toast.error(e.data?.error || e.message || 'Could not upload image.');
    } finally {
      if (kind === 'logo') setUploadingLogo(false); else setUploadingBanner(false);
    }
  }

  function onFile(kind, e) {
    const file = e.target.files?.[0];
    if (file) uploadImage(file, kind);
    e.target.value = ''; // allow re-uploading the same file
  }

  async function changePassword() {
    setPwErr('');
    setPwOk('');
    if (pw.next.length < 8) {
      setPwErr('New password must be at least 8 characters.');
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwErr('New passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: pw.current, newPassword: pw.next },
      });
      setPwOk('Password updated.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      setPwErr(e.data?.error || e.message || 'Could not change password.');
    } finally {
      setPwBusy(false);
    }
  }

  async function savePrefs() {
    setPrefsBusy(true);
    try {
      const res = await api('/api/auth/me', { method: 'PATCH', body: prefs });
      if (res?.user) setUser(res.user);
      toast.success('Notification preferences saved');
    } catch (e) {
      toast.error(e.data?.error || e.message || 'Could not save preferences.');
    } finally {
      setPrefsBusy(false);
    }
  }

  if (profileApi.error && !profileApi.data) {
    return <RetryError message="Couldn't load your profile." onRetry={profileApi.refetch} />;
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-headline-lg font-bold">My profile</h1>
        <p className="text-on-surface-variant text-sm">Manage your business profile, brand assets, payouts, and account settings.</p>
      </div>

      {/* Account */}
      <div className="card p-5 space-y-3">
        <h2 className="font-bold">Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-label-md text-on-surface-variant">Name</div>
            <div className="font-semibold">{user?.name || '—'}</div>
          </div>
          <div>
            <div className="text-label-md text-on-surface-variant">Email</div>
            <div className="font-semibold">{user?.email || '—'}</div>
          </div>
          <div>
            <div className="text-label-md text-on-surface-variant">Role</div>
            <div className="font-semibold">{user?.role || '—'}</div>
          </div>
          <div>
            <div className="text-label-md text-on-surface-variant">Status</div>
            <div className="font-semibold">{user?.vendor?.status || '—'}</div>
          </div>
        </div>
      </div>

      {/* Brand assets: logo + banner */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold">Brand assets</h2>
        <p className="text-label-md text-on-surface-variant">
          The logo and banner are shown on your store listings. Square logo recommended (e.g. 512×512). Banner works best at 1200×400.
        </p>

        {/* Banner — wide preview */}
        <div>
          <label className="text-label-md text-on-surface-variant">Banner</label>
          <div className="mt-2 h-32 rounded-lg bg-surface-low border border-outline-variant/30 overflow-hidden flex items-center justify-center">
            {form.bannerUrl ? (
              <img src={form.bannerUrl} alt="Banner preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-on-surface-variant text-sm flex items-center gap-2">
                <Icon name="image" /> No banner yet
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile('banner', e)} />
            <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner} className="btn-secondary">
              {uploadingBanner ? <Icon name="progress_activity" className="text-[18px] animate-spin" /> : <Icon name="upload" />}
              {form.bannerUrl ? 'Replace' : 'Upload'} banner
            </button>
            {form.bannerUrl && (
              <button type="button" onClick={() => update('bannerUrl', '')} className="text-label-md text-error hover:underline">
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Logo — square preview */}
        <div>
          <label className="text-label-md text-on-surface-variant">Logo</label>
          <div className="mt-2 flex items-center gap-4">
            <div className="w-24 h-24 rounded-lg bg-surface-low border border-outline-variant/30 overflow-hidden flex items-center justify-center shrink-0">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="Logo preview" className="w-full h-full object-cover" />
              ) : (
                <Icon name="storefront" className="text-[36px] text-on-surface-variant" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile('logo', e)} />
              <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="btn-secondary">
                {uploadingLogo ? <Icon name="progress_activity" className="text-[18px] animate-spin" /> : <Icon name="upload" />}
                {form.logoUrl ? 'Replace' : 'Upload'} logo
              </button>
              {form.logoUrl && (
                <button type="button" onClick={() => update('logoUrl', '')} className="text-label-md text-error hover:underline">
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Business */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold">Business profile</h2>
        {err && (
          <div className="card p-3 bg-error/10 text-error text-sm flex items-start gap-2">
            <Icon name="error" className="text-[18px] shrink-0" />
            <span>{err}</span>
          </div>
        )}
        {saved && (
          <div className="card p-3 bg-tertiary/10 text-tertiary text-sm flex items-start gap-2">
            <Icon name="check_circle" className="text-[18px] shrink-0" />
            <span>Profile saved. Admin will be notified of category changes.</span>
          </div>
        )}
        <div>
          <label className="text-label-md text-on-surface-variant">Business name</label>
          <input
            value={form.businessName}
            onChange={(e) => update('businessName', e.target.value)}
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-label-md text-on-surface-variant">Phone</label>
          <input
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            className="input mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-label-md text-on-surface-variant">Business license URL</label>
          <input
            value={form.licenseUrl}
            onChange={(e) => update('licenseUrl', e.target.value)}
            className="input mt-1 w-full"
            placeholder="https://…"
          />
        </div>
        <div>
          <label className="text-label-md text-on-surface-variant">Categories</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_CATEGORIES.map((cat) => {
              const on = form.categories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-label-md ${
                    on ? 'bg-primary text-white' : 'bg-surface-low text-on-surface-variant hover:bg-surface-high'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
        <div className="pt-2 flex justify-end">
          <button onClick={saveProfile} disabled={busy} className="btn-primary">
            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            Save business profile
          </button>
        </div>
      </div>

      {/* Payout — placeholder until Stripe Connect lands. */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold">Payout details</h2>
            <p className="text-label-md text-on-surface-variant">
              Where Yobou will send your earnings. Real Stripe Connect integration is coming soon.
            </p>
          </div>
          <span className="chip">
            <Icon name="hourglass_empty" className="text-[14px]" />
            Coming soon
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-md bg-surface-low text-label-md text-on-surface-variant flex items-center gap-2">
            <Icon name="account_balance" />
            Bank account · not configured
          </div>
          <div className="p-3 rounded-md bg-surface-low text-label-md text-on-surface-variant flex items-center gap-2">
            <Icon name="credit_card" />
            Payout method · not configured
          </div>
        </div>
        <div className="text-label-sm text-on-surface-variant">
          Yobou will notify you when Stripe Connect onboarding is available. Until then, payouts are tracked manually each cycle.
        </div>
      </div>

      {/* Password */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold">Change password</h2>
        {pwErr && (
          <div className="card p-3 bg-error/10 text-error text-sm">{pwErr}</div>
        )}
        {pwOk && (
          <div className="card p-3 bg-tertiary/10 text-tertiary text-sm">{pwOk}</div>
        )}
        <div>
          <label className="text-label-md text-on-surface-variant">Current password</label>
          <input
            type="password"
            value={pw.current}
            onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
            className="input mt-1 w-full"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-label-md text-on-surface-variant">New password</label>
            <input
              type="password"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              className="input mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Confirm new password</label>
            <input
              type="password"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              className="input mt-1 w-full"
            />
          </div>
        </div>
        <div className="pt-2 flex justify-end">
          <button onClick={changePassword} disabled={pwBusy} className="btn-primary">
            {pwBusy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            Update password
          </button>
        </div>
      </div>

      {/* Notification preferences */}
      <div className="card p-5 space-y-4">
        <h2 className="font-bold">Notifications</h2>
        {[
          { k: 'notifyOrderUpdates', label: 'Order updates', desc: 'New orders, status changes, payment events.' },
          { k: 'notifyShipping', label: 'Shipping alerts', desc: 'Carrier updates, delivery confirmations.' },
          { k: 'notifyPromotions', label: 'Promotions', desc: 'Newsletters, tips, product announcements.' },
        ].map((row) => (
          <label key={row.k} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(prefs[row.k])}
              onChange={(e) => setPrefs((p) => ({ ...p, [row.k]: e.target.checked }))}
              className="mt-1"
            />
            <div>
              <div className="font-semibold text-sm">{row.label}</div>
              <div className="text-label-md text-on-surface-variant">{row.desc}</div>
            </div>
          </label>
        ))}
        <div className="pt-2 flex justify-end">
          <button onClick={savePrefs} disabled={prefsBusy} className="btn-primary">
            {prefsBusy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}