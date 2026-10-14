// Admin Finance — the platform's money view.
//   - Totals: commission earned, Yobou Direct sales, owed to stores,
//     payouts waiting, COD cash still with couriers
//   - Payout requests: pay (with transfer reference) or reject (refunds the balance)
//   - Stores: balance, sales, commission rate (editable per store)
// Server: routes/finance.js. Courier cash is settled from Deliveries → Couriers.
import StatusBadge from '../../components/StatusBadge';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import KPICard from '../../components/KPICard';
import { useApi, RetryError } from '../../useApi.jsx';

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const PAYOUT_STYLES = {
  REQUESTED: 'bg-secondary/20 text-secondary',
  PAID: 'bg-tertiary-container/20 text-tertiary',
  REJECTED: 'bg-error/10 text-error',
};

export default function Finance() {
  const financeApi = useApi('/api/admin/finance');
  const [status, setStatus] = useState('REQUESTED');
  const payoutsPath = useMemo(() => `/api/admin/payouts${status ? `?status=${status}` : ''}`, [status]);
  const payoutsApi = useApi(payoutsPath);
  const [review, setReview] = useState(null); // { payout, decision }
  const [commission, setCommission] = useState(null); // store row

  const refetchAll = () => { financeApi.refetch(); payoutsApi.refetch(); };

  if (financeApi.error && !financeApi.data) return <RetryError message="Couldn't load finance." onRetry={financeApi.refetch} />;
  const f = financeApi.data;
  const payouts = payoutsApi.data?.payouts || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-headline-lg font-bold">Finance</h1>
        <p className="text-on-surface-variant text-sm">
          Commission, store balances and payouts. Stores are credited when their orders are delivered; refunds reverse the credit.
        </p>
      </div>

      {f && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard label="Commission earned" value={money(f.totals.commissionEarnedCents)} icon="percent" tone="tertiary" />
          <KPICard label="Yobou Direct sales" value={money(f.totals.directSalesCents)} icon="storefront" />
          <KPICard label="Owed to stores" value={money(f.totals.owedToStoresCents)} icon="account_balance_wallet" />
          <KPICard label="Payouts waiting" value={money(f.totals.requestedPayoutsCents)} icon="pending_actions" tone="secondary" />
          <Link to="/deliveries" className="block">
            <KPICard label="Cash with couriers" value={money(f.totals.cashWithCouriersCents)} icon="two_wheeler" tone="secondary" />
          </Link>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-bold text-lg">Payout requests</h2>
          <select className="input w-auto py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="REQUESTED">Waiting</option>
            <option value="PAID">Paid</option>
            <option value="REJECTED">Rejected</option>
            <option value="">All</option>
          </select>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-label-md text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {payouts.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">No payouts here.</td></tr>
              )}
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-outline-variant/20">
                  <td className="px-4 py-3 font-semibold">{p.vendor?.businessName}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{new Date(p.requestedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{p.method}</td>
                  <td className="px-4 py-3 text-right font-semibold">{money(p.amountCents)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                    {(p.reference || p.adminNote) && (
                      <div className="text-label-md text-on-surface-variant mt-1">{p.reference ? `Ref ${p.reference}` : p.adminNote}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {p.status === 'REQUESTED' && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setReview({ payout: p, decision: 'reject' })} className="btn-secondary py-1.5 px-3 text-error">Reject</button>
                        <button onClick={() => setReview({ payout: p, decision: 'pay' })} className="btn-primary py-1.5 px-3">Mark paid</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-lg">Stores</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-label-md text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3 text-right">Delivered sales</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right">Payout waiting</th>
              </tr>
            </thead>
            <tbody>
              {!f && <tr><td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">Loading…</td></tr>}
              {f?.stores.map((s) => (
                <tr key={s.vendorId} className="border-t border-outline-variant/20">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{s.businessName}</div>
                    {s.status !== 'APPROVED' && <div className="text-label-md text-error">{s.status}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">{money(s.grossSalesCents)}</td>
                  <td className="px-4 py-3 text-right text-tertiary">{money(s.commissionCents)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setCommission(s)} className="font-semibold text-primary hover:underline" title="Change commission rate">
                      {(s.commissionBps / 100).toFixed(1)}%
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money(s.balanceCents)}</td>
                  <td className="px-4 py-3 text-right">{s.requestedPayoutCents ? money(s.requestedPayoutCents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ReviewModal review={review} onClose={() => setReview(null)} onDone={() => { setReview(null); refetchAll(); }} />
      <CommissionModal store={commission} onClose={() => setCommission(null)} onDone={() => { setCommission(null); financeApi.refetch(); }} />
    </div>
  );
}

function ReviewModal({ review, onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!review) return null;
  const pay = review.decision === 'pay';
  const p = review.payout;

  async function submit() {
    setBusy(true); setErr('');
    try {
      await api(`/api/admin/payouts/${p.id}/${review.decision}`, {
        method: 'POST',
        body: pay ? { reference: text.trim() } : { adminNote: text.trim() },
      });
      setText('');
      onDone();
    } catch (e) {
      setErr(e?.data?.error === 'ALREADY_REVIEWED' ? 'Someone already handled this payout.' : 'Could not update the payout.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${pay ? 'Mark paid' : 'Reject'} · ${p.vendor?.businessName} · ${money(p.amountCents)}`}
      footer={(
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={busy || text.trim().length < (pay ? 2 : 3)} className={`${pay ? 'btn-primary' : 'btn-danger'} disabled:opacity-60`}>
            {pay ? 'Confirm payment' : 'Reject payout'}
          </button>
        </>
      )}
    >
      <label className="block text-sm">
        <span className="text-label-md text-on-surface-variant">
          {pay ? `Transfer reference (${p.method})` : 'Reason (sent to the store; the amount returns to their balance)'}
        </span>
        <input className="input mt-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={pay ? 'e.g. OM-2026-10-14-8831' : ''} />
      </label>
      {err && <div className="text-error text-sm mt-2">{err}</div>}
    </Modal>
  );
}

function CommissionModal({ store, onClose, onDone }) {
  const [pct, setPct] = useState('');
  const [busy, setBusy] = useState(false);
  if (!store) return null;
  const value = pct === '' ? store.commissionBps / 100 : Number(pct);
  const valid = Number.isFinite(value) && value >= 0 && value <= 50;

  async function submit() {
    setBusy(true);
    try {
      await api(`/api/admin/vendors/${store.vendorId}/commission`, { method: 'PATCH', body: { commissionBps: Math.round(value * 100) } });
      setPct('');
      onDone();
    } catch {
      window.alert('Could not update the commission.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { setPct(''); onClose(); }}
      title={`Commission · ${store.businessName}`}
      footer={(
        <>
          <button onClick={() => { setPct(''); onClose(); }} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={!valid || busy} className="btn-primary disabled:opacity-60">Save</button>
        </>
      )}
    >
      <label className="block text-sm">
        <span className="text-label-md text-on-surface-variant">Commission (%) — applies to orders delivered from now on</span>
        <input className="input mt-1" type="number" min={0} max={50} step="0.5" value={pct === '' ? store.commissionBps / 100 : pct} onChange={(e) => setPct(e.target.value)} />
      </label>
      <p className="text-label-md text-on-surface-variant mt-2 flex items-center gap-1">
        <Icon name="info" className="text-[16px]" /> The store is notified of the new rate.
      </p>
    </Modal>
  );
}
