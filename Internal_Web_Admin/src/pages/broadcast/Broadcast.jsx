// Admin broadcast composer.
//
// Posts a single notification that fans out to the chosen audience via the
// in-app inbox + SSE stream. The body and title are visible verbatim in the
// recipient's bell dropdown, so write them as you would an email subject +
// body. There's no scheduling yet — broadcasts are delivered immediately.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';

const AUDIENCES = [
  { value: 'all', label: 'Everyone', icon: 'groups' },
  { value: 'customers', label: 'Customers', icon: 'shopping_bag' },
  { value: 'vendors', label: 'Vendors', icon: 'storefront' },
  { value: 'admins', label: 'Admins', icon: 'shield' },
];

export default function Broadcast() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('customers');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    let alive = true;
    api('/api/admin/users?limit=200').then((d) => {
      if (!alive) return;
      const all = d.users || [];
      setCounts({
        all: all.length,
        customers: all.filter((u) => u.role === 'CUSTOMER').length,
        vendors: all.filter((u) => u.role === 'VENDOR').length,
        admins: all.filter((u) => u.role === 'ADMIN').length,
      });
    }).catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, []);

  async function send(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.');
      return;
    }
    if (!confirm(`Send to ${audience}? This delivers immediately to ${counts?.[audience] ?? '—'} users.`)) return;
    setBusy(true); setError(''); setSuccess(null);
    try {
      const res = await api('/api/admin/broadcast', {
        method: 'POST',
        body: {
          title: title.trim(),
          body: body.trim(),
          audience,
          link: link.trim() || undefined,
        },
      });
      setSuccess({ recipientCount: res.recipientCount, created: res.created });
      setTitle(''); setBody(''); setLink('');
    } catch (e2) {
      setError(e2?.data?.error === 'INVALID_INPUT' ? 'Check title/body/audience.' : 'Could not send broadcast.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-headline-lg font-bold">Broadcast</h1>
      <p className="text-on-surface-variant text-sm">
        Send an in-app notification to a segment of users. They see it as a bell badge with your title
        and body. Optional link deep-links them when they tap.
      </p>

      {error && <div className="card p-3 bg-error/10 text-error text-sm">{error}</div>}
      {success && (
        <div className="card p-3 bg-tertiary/20 text-on-surface text-sm flex items-center gap-2">
          <Icon name="check_circle" className="text-[20px]" />
          Sent to {success.recipientCount} users ({success.created} new inbox rows).
        </div>
      )}

      <form onSubmit={send} className="card p-5 space-y-4">
        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Audience</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {AUDIENCES.map((a) => (
              <button
                type="button"
                key={a.value}
                onClick={() => setAudience(a.value)}
                className={`p-3 rounded-md border text-left ${
                  audience === a.value
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/30 hover:bg-surface-low'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon name={a.icon} className="text-[18px]" />
                  <span className="font-medium text-sm">{a.label}</span>
                </div>
                <div className="text-label-sm text-on-surface-variant mt-1">
                  {counts ? `${counts[a.value]} users` : '…'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            maxLength={120}
            placeholder="e.g. Weekend sale starts Friday"
          />
        </div>

        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="input"
            maxLength={1000}
            placeholder="Tell them what's happening, why it matters, what to do next."
          />
        </div>

        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Link (optional)</label>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="input"
            placeholder="e.g. /products?category=sale or /orders/abc/track"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => { setTitle(''); setBody(''); setLink(''); setError(''); }}
            className="btn-secondary"
          >
            Clear
          </button>
          <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? 'Sending…' : 'Send broadcast'}
          </button>
        </div>
      </form>
    </div>
  );
}