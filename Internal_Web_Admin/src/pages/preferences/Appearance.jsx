// Appearance / theme picker for the admin portal.
//
// Mirrors the shopper's `pages/profile/ProfilePreferences.jsx` card but
// lives at its own route so admins can navigate to it from the sidebar
// or be deep-linked. The existing sidebar still has a binary "Light /
// Dark mode" quick toggle (calls `toggleDark`); this page is the full
// three-way picker (light / dark / system) plus a short explainer of
// what each option does.
//
// `theme` and `dark` come from the zustand store; `setTheme` already
// POSTs to /api/auth/me when the user is signed in. The store also
// listens for OS-level preference changes when theme === 'system', so
// the picker stays in sync with the device.
import { useStore } from '../../store';
import { useState } from 'react';
import Icon from '../../components/Icon';

const THEMES = [
  { code: 'light', label: 'Light', icon: 'light_mode', desc: 'Always use the light palette, even if your device is in dark mode.' },
  { code: 'dark', label: 'Dark', icon: 'dark_mode', desc: 'Always use the dark palette. Easier on the eyes at night.' },
  { code: 'system', label: 'System default', icon: 'desktop_windows', desc: 'Follow your device setting. Changes automatically with the OS.' },
];

export default function Appearance() {
  const theme = useStore((s) => s.theme);
  const dark = useStore((s) => s.dark);
  const setTheme = useStore((s) => s.setTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  async function pick(code) {
    if (code === theme) return;
    setErr(''); setSaved(false);
    setSaving(true);
    try {
      // setTheme handles the localStorage + class toggle + (when signed
      // in) the server PATCH. See store.js _applyTheme.
      await setTheme(code, true);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not save theme.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-headline-lg font-bold">Appearance</h1>
        <p className="text-on-surface-variant text-sm">
          Choose how the admin portal looks. Your choice syncs across devices once you sign in.
        </p>
      </div>

      {err && (
        <div className="card p-3 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[18px] shrink-0" />
          <span>{err}</span>
        </div>
      )}
      {saved && (
        <div className="card p-3 bg-tertiary/10 text-tertiary text-sm flex items-center gap-2">
          <Icon name="check_circle" className="text-[18px]" />
          <span>Saved. Theme is now {theme === 'system' ? `system (currently ${dark ? 'dark' : 'light'})` : theme}.</span>
        </div>
      )}

      <div className="card p-4 md:p-5">
        <h2 className="text-base font-semibold text-on-surface mb-4 flex items-center gap-2">
          <Icon name="palette" className="text-[20px] text-primary" /> Theme
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEMES.map((t) => {
            const active = theme === t.code;
            return (
              <button
                key={t.code}
                onClick={() => pick(t.code)}
                disabled={saving}
                aria-pressed={active}
                className={`flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/40 hover:bg-surface-low'
                } ${saving ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Icon name={t.icon} className={`text-[22px] ${active ? 'text-primary' : 'text-on-surface-variant'}`} />
                  <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-on-surface'}`}>{t.label}</span>
                </div>
                <div className="text-xs text-on-surface-variant">{t.desc}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-label-sm text-on-surface-variant">
          Current look: <span className="font-medium text-on-surface">{dark ? 'Dark' : 'Light'}</span>
          {theme === 'system' && ' (following your device)'}
        </p>
      </div>

      <div className="card p-4 md:p-5">
        <h2 className="text-base font-semibold text-on-surface mb-2 flex items-center gap-2">
          <Icon name="info" className="text-[20px] text-primary" /> About theme syncing
        </h2>
        <ul className="text-sm text-on-surface-variant space-y-1.5 list-disc pl-5">
          <li>Your theme choice is saved to your account and follows you to any device you sign in from.</li>
          <li>When set to "System default", the portal switches automatically when your OS flips light/dark at sunset.</li>
          <li>The page is themed before React mounts, so hard refreshes don't flash a light page on a dark device.</li>
        </ul>
      </div>
    </div>
  );
}
