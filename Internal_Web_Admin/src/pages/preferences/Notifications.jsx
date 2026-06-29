// Notification preferences — toggle which kinds of admin-relevant events
// deliver in-app inbox rows + SSE pushes for the current admin.
//
// The backend enforces these via shouldSuppress() in lib/notifications.js.
// They only control the in-app channel because there is no email or push
// channel yet. When push is added, the same toggles will gate those too.
import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api';
import Icon from '../../components/Icon';

// Mirrors server fields exactly. Don't add a key here without first
// adding the column to schema.prisma and updateProfile validator.
const PREFERENCES = [
  { key: 'notifyOrderUpdates', label: 'Order updates', desc: 'Cancelled, shipped, delivered, refunded.', icon: 'receipt_long' },
  { key: 'notifyShipping', label: 'Shipping milestones', desc: 'Out for delivery, delivery exceptions.', icon: 'local_shipping' },
  { key: 'notifyPromotions', label: 'Broadcasts', desc: 'Announcements sent by other admins (informational).', icon: 'campaign' },
];

export default function Notifications() {
  const user = useStore((s) => s.user);
  const refresh = useStore((s) => s.refresh);
  const [prefs, setPrefs] = useState({
    notifyOrderUpdates: true,
    notifyShipping: true,
    notifyPromotions: false,
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPrefs({
      notifyOrderUpdates: user.notifyOrderUpdates ?? true,
      notifyShipping: user.notifyShipping ?? true,
      notifyPromotions: user.notifyPromotions ?? false,
    });
  }, [user]);

  async function save() {
    setBusy(true); setSaved(false);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: prefs });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert('Could not save preferences.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-headline-lg font-bold">Notification preferences</h1>
      <p className="text-on-surface-variant text-sm">
        Choose which kinds of admin events deliver to your in-app inbox and
        notification bell. Changes apply immediately.
      </p>

      <div className="card divide-y divide-outline-variant/20">
        {PREFERENCES.map((p) => (
          <div key={p.key} className="flex items-start gap-4 p-4">
            <Icon name={p.icon} className="text-[24px] text-on-surface-variant mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{p.label}</div>
              <div className="text-sm text-on-surface-variant">{p.desc}</div>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!prefs[p.key]}
                onChange={(e) => setPrefs({ ...prefs, [p.key]: e.target.checked })}
                className="sr-only peer"
              />
              <span className="w-11 h-6 bg-surface-high rounded-full peer-checked:bg-primary relative transition-colors">
                <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
              </span>
            </label>
          </div>
        ))}
      </div>

      <div className="flex justify-end items-center gap-3">
        {saved && (
          <span className="text-tertiary text-sm flex items-center gap-1">
            <Icon name="check" className="text-[18px]" /> Saved
          </span>
        )}
        <button onClick={save} disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}