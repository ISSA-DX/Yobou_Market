import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { formatPrice, CURRENCIES, LANGUAGES } from '../../lib/format';

const THEMES = [
  { code: 'light', label: 'Light', icon: 'light_mode' },
  { code: 'dark', label: 'Dark', icon: 'dark_mode' },
  { code: 'system', label: 'System default', icon: 'desktop_windows' },
];

export default function ProfilePreferences() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const theme = useStore((s) => s.theme);
  const dark = useStore((s) => s.dark);
  const setTheme = useStore((s) => s.setTheme);
  const updatePreferences = useStore((s) => s.updatePreferences);

  const [prefs, setPrefs] = useState({
    language: 'en',
    currency: 'USD',
    notifyOrderUpdates: true,
    notifyPromotions: false,
    notifyShipping: true,
    marketingConsent: false,
  });
  const [savingFields, setSavingFields] = useState(new Set());
  const [savedFields, setSavedFields] = useState(new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setPrefs({
        language: user.language || 'en',
        currency: user.currency || 'USD',
        notifyOrderUpdates: user.notifyOrderUpdates ?? true,
        notifyPromotions: user.notifyPromotions ?? false,
        notifyShipping: user.notifyShipping ?? true,
        marketingConsent: user.marketingConsent ?? false,
      });
    }
  }, [user]);

  async function save(field, value) {
    setSavingFields((s) => new Set(s).add(field));
    setError('');
    try {
      await updatePreferences({ [field]: value });
      setSavedFields((s) => new Set(s).add(field));
      setTimeout(() => {
        setSavedFields((s) => {
          const next = new Set(s);
          next.delete(field);
          return next;
        });
      }, 1500);
    } catch (e) {
      setError(e.message || 'Could not save preference.');
      // Revert local state to user value on failure.
      if (user) setPrefs((p) => ({ ...p, [field]: user[field] }));
    } finally {
      setSavingFields((s) => {
        const next = new Set(s);
        next.delete(field);
        return next;
      });
    }
  }

  async function handleTheme(next) {
    const field = 'theme';
    setSavingFields((s) => new Set(s).add(field));
    setError('');
    try {
      setTheme(next, false); // Update UI/localStorage only.
      await updatePreferences({ theme: next }); // Single server save.
      setSavedFields((s) => new Set(s).add(field));
      setTimeout(() => {
        setSavedFields((s) => {
          const nextSet = new Set(s);
          nextSet.delete(field);
          return nextSet;
        });
      }, 1500);
    } catch (e) {
      setError(e.message || 'Could not save theme.');
    } finally {
      setSavingFields((s) => {
        const next = new Set(s);
        next.delete(field);
        return next;
      });
    }
  }

  function change(field, value) {
    setPrefs((p) => ({ ...p, [field]: value }));
    save(field, value);
  }

  function toggle(field) {
    const next = !prefs[field];
    change(field, next);
  }

  const samplePrice = formatPrice(4999, prefs.currency, prefs.language);
  const isSaving = savingFields.size > 0;

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-outline-variant/30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/profile')} className="p-2 -ml-2 rounded-full hover:bg-surface-low">
            <Icon name="arrow_back" className="text-[22px]" />
          </button>
          <h1 className="text-lg font-bold text-on-surface">Preferences</h1>
          {isSaving && <span className="ml-auto text-label-sm text-on-surface-variant">Saving…</span>}
          {!isSaving && savedFields.size > 0 && (
            <span className="ml-auto text-label-sm text-green-600 flex items-center gap-1">
              <Icon name="check_circle" className="text-[16px]" /> Saved
            </span>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-24">
        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm border border-red-100">
            {error}
          </div>
        )}

        {/* Appearance / Theme */}
        <section className="card p-4 md:p-5">
          <h2 className="text-base font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Icon name="palette" className="text-[20px] text-primary" /> Appearance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.code}
                onClick={() => handleTheme(t.code)}
                disabled={savingFields.has('theme')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition ${
                  theme === t.code
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-outline-variant/40 hover:bg-surface-low text-on-surface'
                } ${savingFields.has('theme') ? 'opacity-60' : ''}`}
              >
                <Icon name={t.icon} className="text-[22px]" />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-on-surface-variant">
            Current look: <span className="font-medium text-on-surface">{dark ? 'Dark' : 'Light'}</span>
            {theme === 'system' && ' (following your device)'}
          </p>
        </section>

        {/* Region */}
        <section className="card p-4 md:p-5">
          <h2 className="text-base font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Icon name="language" className="text-[20px] text-primary" /> Region
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">Language</label>
              <select
                value={prefs.language}
                onChange={(e) => change('language', e.target.value)}
                disabled={savingFields.has('language')}
                className="w-full rounded-lg border border-outline-variant/50 bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-on-surface-variant">
                Saved language: <span className="font-medium text-on-surface">{prefs.language.toUpperCase()}</span>.
                Full translations will be applied across the app in a future release.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-on-surface mb-1.5">Currency</label>
              <select
                value={prefs.currency}
                onChange={(e) => change('currency', e.target.value)}
                disabled={savingFields.has('currency')}
                className="w-full rounded-lg border border-outline-variant/50 bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-on-surface-variant">
                Sample price display: <span className="font-medium text-on-surface">{samplePrice}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section className="card p-4 md:p-5">
          <h2 className="text-base font-semibold text-on-surface mb-4 flex items-center gap-2">
            <Icon name="notifications" className="text-[20px] text-primary" /> Notifications
          </h2>

          <div className="space-y-4">
            <Toggle
              icon="local_shipping"
              label="Order & shipping updates"
              desc="Get notified when your order is confirmed, shipped, and delivered."
              checked={prefs.notifyShipping}
              onChange={() => toggle('notifyShipping')}
              busy={savingFields.has('notifyShipping')}
            />
            <Toggle
              icon="receipt_long"
              label="Order status changes"
              desc="Alerts when an order is paid, processing, or cancelled."
              checked={prefs.notifyOrderUpdates}
              onChange={() => toggle('notifyOrderUpdates')}
              busy={savingFields.has('notifyOrderUpdates')}
            />
            <Toggle
              icon="sell"
              label="Promotions and deals"
              desc="Occasional emails about sales, new arrivals, and recommendations."
              checked={prefs.notifyPromotions}
              onChange={() => toggle('notifyPromotions')}
              busy={savingFields.has('notifyPromotions')}
            />
            <Toggle
              icon="campaign"
              label="Marketing consent"
              desc="Allow Yobou to use your preferences to personalize offers."
              checked={prefs.marketingConsent}
              onChange={() => toggle('marketingConsent')}
              busy={savingFields.has('marketingConsent')}
            />
          </div>
        </section>

        <section className="card p-4 md:p-5">
          <h2 className="text-base font-semibold text-on-surface mb-2 flex items-center gap-2">
            <Icon name="info" className="text-[20px] text-primary" /> About
          </h2>
          <p className="text-sm text-on-surface-variant">
            Yobou v1.0.0 ·{' '}
            <Link to="/help" className="text-primary hover:underline">Help center</Link>
          </p>
        </section>
      </main>
    </div>
  );
}

function Toggle({ icon, label, desc, checked, onChange, busy }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 w-9 h-9 rounded-full bg-surface-low flex items-center justify-center text-on-surface-variant">
          <Icon name={icon} className="text-[18px]" />
        </div>
        <div>
          <div className="text-sm font-medium text-on-surface">{label}</div>
          <div className="text-xs text-on-surface-variant mt-0.5">{desc}</div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={busy}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
          checked ? 'bg-primary' : 'bg-outline-variant/50'
        } ${busy ? 'opacity-60' : ''}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
          style={{ marginTop: '4px' }}
        />
      </button>
    </div>
  );
}
