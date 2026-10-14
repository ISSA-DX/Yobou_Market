// Admin Promotions — promo codes customers type at checkout.
// Server: routes/coupons.js (rules in lib/coupons.js). Discounts are funded
// by Yobou: stores are still credited on full item prices.
import { useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useApi, RetryError } from '../../useApi.jsx';

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

function status(c) {
  const now = Date.now();
  if (!c.isActive) return { label: 'Off', cls: 'bg-surface-high text-on-surface-variant' };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: 'Expired', cls: 'bg-error/10 text-error' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: 'Scheduled', cls: 'bg-secondary/20 text-secondary' };
  if (c.maxUses != null && c.usedCount >= c.maxUses) return { label: 'Used up', cls: 'bg-error/10 text-error' };
  return { label: 'Live', cls: 'bg-tertiary-container/20 text-tertiary' };
}

const describe = (c) => (c.kind === 'PERCENT'
  ? `${c.value}% off${c.maxDiscountCents ? ` (max ${money(c.maxDiscountCents)})` : ''}`
  : `${money(c.value)} off`);

export default function Promotions() {
  const { data, error, loading, refetch } = useApi('/api/coupons');
  const [editing, setEditing] = useState(null); // coupon or {} for new

  async function toggle(c) {
    try {
      await api(`/api/coupons/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } });
      refetch();
    } catch {
      window.alert('Could not update the code.');
    }
  }

  if (error && !data) return <RetryError message="Couldn't load promo codes." onRetry={refetch} />;
  const coupons = data?.coupons || [];
  const given = coupons.reduce((s, c) => s + c.discountGivenCents, 0);
  const uses = coupons.reduce((s, c) => s + c.usedCount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-headline-lg font-bold">Promotions</h1>
          <p className="text-on-surface-variant text-sm">
            Promo codes for checkout. Discounts are paid by Yobou — store earnings are not reduced.
            {coupons.length > 0 && ` ${uses} redemptions · ${money(given)} given so far.`}
          </p>
        </div>
        <button onClick={() => setEditing({})} className="btn-primary"><Icon name="add" /> New code</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Offer</th>
              <th className="px-4 py-3">Conditions</th>
              <th className="px-4 py-3">Uses</th>
              <th className="px-4 py-3 text-right">Discount given</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">Loading…</td></tr>}
            {!loading && coupons.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">No promo codes yet — create one for your launch.</td></tr>
            )}
            {coupons.map((c) => {
              const st = status(c);
              return (
                <tr key={c.id} className="border-t border-outline-variant/20 align-top">
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold">{c.code}</div>
                    {c.description && <div className="text-label-md text-on-surface-variant">{c.description}</div>}
                  </td>
                  <td className="px-4 py-3">{describe(c)}</td>
                  <td className="px-4 py-3 text-on-surface-variant text-label-md space-y-0.5">
                    {c.minSubtotalCents > 0 && <div>Min. basket {money(c.minSubtotalCents)}</div>}
                    <div>{c.perUserLimit === 1 ? 'Once per customer' : `${c.perUserLimit}× per customer`}</div>
                    {(c.startsAt || c.endsAt) && (
                      <div>
                        {c.startsAt ? new Date(c.startsAt).toLocaleDateString() : '…'} → {c.endsAt ? new Date(c.endsAt).toLocaleDateString() : '…'}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ''}</td>
                  <td className="px-4 py-3 text-right">{money(c.discountGivenCents)}</td>
                  <td className="px-4 py-3"><span className={`chip border-0 ${st.cls}`}>{st.label}</span></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(c)} className="p-2 rounded-md hover:bg-surface-low text-on-surface-variant" title="Edit">
                      <Icon name="edit" className="text-[20px]" />
                    </button>
                    <button onClick={() => toggle(c)} className={`text-sm font-semibold ml-1 ${c.isActive ? 'text-error' : 'text-primary'}`}>
                      {c.isActive ? 'Turn off' : 'Turn on'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && <CouponModal coupon={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />}
    </div>
  );
}

const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const centsToInput = (c) => (c == null ? '' : String(c / 100));

function CouponModal({ coupon, onClose, onSaved }) {
  const isNew = !coupon.id;
  const [f, setF] = useState({
    code: coupon.code || '',
    description: coupon.description || '',
    kind: coupon.kind || 'PERCENT',
    value: coupon.kind === 'FIXED' ? centsToInput(coupon.value) : (coupon.value ? String(coupon.value) : ''),
    minSubtotal: centsToInput(coupon.minSubtotalCents || null),
    maxDiscount: centsToInput(coupon.maxDiscountCents),
    maxUses: coupon.maxUses ? String(coupon.maxUses) : '',
    perUserLimit: String(coupon.perUserLimit || 1),
    startsAt: toDateInput(coupon.startsAt),
    endsAt: toDateInput(coupon.endsAt),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const cents = (v) => (v === '' ? null : Math.round(Number(v) * 100));
    const body = {
      code: f.code.trim(),
      description: f.description.trim() || null,
      kind: f.kind,
      value: f.kind === 'PERCENT' ? Math.round(Number(f.value)) : cents(f.value),
      minSubtotalCents: cents(f.minSubtotal) || 0,
      maxDiscountCents: f.kind === 'PERCENT' ? cents(f.maxDiscount) : null,
      maxUses: f.maxUses === '' ? null : Math.round(Number(f.maxUses)),
      perUserLimit: Math.max(1, Math.round(Number(f.perUserLimit) || 1)),
      // Whole days: start of the start day, end of the end day.
      startsAt: f.startsAt ? new Date(`${f.startsAt}T00:00:00`).toISOString() : null,
      endsAt: f.endsAt ? new Date(`${f.endsAt}T23:59:59`).toISOString() : null,
    };
    try {
      if (isNew) await api('/api/coupons', { method: 'POST', body });
      else await api(`/api/coupons/${coupon.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e2) {
      const code = e2?.data?.error;
      setErr(code === 'CODE_TAKEN' ? 'That code already exists.'
        : code === 'CODE_IN_USE' ? 'This code was already used, so its name can no longer change.'
          : e2?.data?.message || 'Please check the fields (codes use letters, numbers, - and _).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={isNew ? 'New promo code' : `Edit ${coupon.code}`}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" form="coupon-form" disabled={busy} className="btn-primary disabled:opacity-60">{isNew ? 'Create code' : 'Save'}</button>
        </>
      )}
    >
      <form id="coupon-form" onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Code</span>
          <input className="input mt-1 uppercase font-mono" required minLength={3} maxLength={30} value={f.code} onChange={set('code')} placeholder="LAUNCH20" />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Description (shown to customers)</span>
          <input className="input mt-1" maxLength={200} value={f.description} onChange={set('description')} placeholder="20% off your first order" />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Type</span>
          <select className="input mt-1" value={f.kind} onChange={set('kind')}>
            <option value="PERCENT">Percentage off</option>
            <option value="FIXED">Fixed amount off</option>
          </select>
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">{f.kind === 'PERCENT' ? 'Percent (1–100)' : 'Amount off ($)'}</span>
          <input className="input mt-1" type="number" required min={f.kind === 'PERCENT' ? 1 : 0.01} max={f.kind === 'PERCENT' ? 100 : undefined} step={f.kind === 'PERCENT' ? 1 : 0.01} value={f.value} onChange={set('value')} />
        </label>
        {f.kind === 'PERCENT' && (
          <label className="block">
            <span className="text-label-md text-on-surface-variant">Max discount ($, optional)</span>
            <input className="input mt-1" type="number" min={0.01} step={0.01} value={f.maxDiscount} onChange={set('maxDiscount')} />
          </label>
        )}
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Minimum basket ($, optional)</span>
          <input className="input mt-1" type="number" min={0} step={0.01} value={f.minSubtotal} onChange={set('minSubtotal')} />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Total uses (empty = unlimited)</span>
          <input className="input mt-1" type="number" min={1} step={1} value={f.maxUses} onChange={set('maxUses')} />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Uses per customer</span>
          <input className="input mt-1" type="number" min={1} max={100} step={1} value={f.perUserLimit} onChange={set('perUserLimit')} />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Starts (optional)</span>
          <input className="input mt-1" type="date" value={f.startsAt} onChange={set('startsAt')} />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Ends (optional)</span>
          <input className="input mt-1" type="date" value={f.endsAt} onChange={set('endsAt')} />
        </label>
        {err && <div className="sm:col-span-2 text-error">{err}</div>}
      </form>
    </Modal>
  );
}
