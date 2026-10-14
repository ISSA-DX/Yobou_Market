// Payouts — the store's money with Yobou.
//   - Available balance (delivered orders, net of commission) → request payout
//   - Pending (paid orders not yet delivered)
//   - Lifetime sales / commission / net
//   - Statement (ledger) and payout history
// Server: GET /api/vendor/finance, POST /api/vendor/payouts (routes/finance.js).
import StatusBadge from '../../components/StatusBadge';
import { useState } from 'react';
import { api } from '../../api';
import { useStore } from '../../store';
import { useApi, RetryError } from '../../useApi.jsx';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import KPICard from '../../components/KPICard';
import { toast } from '../../lib/toast';
import { formatPrice } from '../../lib/format';

const KIND = {
  EARNING: { label: 'Sale delivered', icon: 'add_circle', cls: 'text-tertiary' },
  REFUND: { label: 'Refund', icon: 'undo', cls: 'text-error' },
  PAYOUT: { label: 'Payout', icon: 'account_balance', cls: 'text-on-surface' },
  ADJUSTMENT: { label: 'Adjustment', icon: 'tune', cls: 'text-secondary' },
};
const PAYOUT_STYLES = {
  REQUESTED: 'bg-secondary/20 text-secondary',
  PAID: 'bg-tertiary-container/20 text-tertiary',
  REJECTED: 'bg-error/10 text-error',
};
const METHODS = ['Bank transfer', 'Orange Money', 'Wave', 'MTN Mobile Money', 'Moov Money'];

export default function Payouts() {
  const user = useStore((s) => s.user);
  const currency = user?.currency || 'USD';
  const fmt = (c) => formatPrice(c, currency);
  const { data, error, loading, refetch } = useApi('/api/vendor/finance');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('statement');

  if (error && !data) return <RetryError message="Couldn't load your payouts." onRetry={refetch} />;
  if (loading && !data) return <div className="p-8 text-center text-on-surface-variant">Loading…</div>;
  const f = data;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-headline-lg font-bold">Payouts</h1>
          <p className="text-on-surface-variant text-sm">
            Earnings are credited when an order is delivered, minus Yobou&apos;s {(f.commissionBps / 100).toFixed(1)}% commission.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          disabled={f.balanceCents < f.minPayoutCents}
          className="btn-primary disabled:opacity-60"
          title={f.balanceCents < f.minPayoutCents ? `Minimum payout is ${fmt(f.minPayoutCents)}` : ''}
        >
          <Icon name="account_balance" /> Request payout
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Available balance" value={fmt(f.balanceCents)} icon="account_balance_wallet" />
        <KPICard label="Pending delivery" value={fmt(f.pendingCents)} icon="schedule" />
        <KPICard label="Lifetime sales" value={fmt(f.lifetime.grossCents)} icon="payments" />
        <KPICard label="Commission paid" value={fmt(f.lifetime.commissionCents)} icon="percent" />
      </div>

      <div className="flex gap-2">
        {[['statement', 'Statement'], ['payouts', 'Payout history']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'btn-primary py-2' : 'btn-secondary py-2'}>{label}</button>
        ))}
      </div>

      {tab === 'statement' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-label-md text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Commission</th>
                <th className="px-4 py-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {f.ledger.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">No entries yet — they appear as your orders are delivered.</td></tr>
              )}
              {f.ledger.map((e) => {
                const k = KIND[e.kind] || { label: e.kind, icon: 'receipt', cls: '' };
                return (
                  <tr key={e.id} className="border-t border-outline-variant/20">
                    <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(e.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon name={k.icon} className={`text-[18px] ${k.cls}`} />
                        <div>
                          <div className="font-medium">{k.label}</div>
                          {e.note && <div className="text-label-md text-on-surface-variant">{e.note}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{e.grossCents ? fmt(e.grossCents) : '—'}</td>
                    <td className="px-4 py-3 text-right text-on-surface-variant">{e.commissionCents ? fmt(-e.commissionCents) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${e.amountCents < 0 ? 'text-error' : 'text-tertiary'}`}>{fmt(e.amountCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payouts' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-label-md text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {f.payouts.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">No payouts yet.</td></tr>
              )}
              {f.payouts.map((p) => (
                <tr key={p.id} className="border-t border-outline-variant/20">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(p.requestedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{p.method}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(p.amountCents)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-on-surface-variant">{p.reference ? `Ref ${p.reference}` : p.adminNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RequestModal open={open} finance={f} fmt={fmt} onClose={() => setOpen(false)} onDone={() => { setOpen(false); refetch(); }} />
    </div>
  );
}

function RequestModal({ open, finance, fmt, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState(METHODS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return null;

  const cents = Math.round(Number(amount) * 100);
  const valid = cents >= finance.minPayoutCents && cents <= finance.balanceCents;

  async function submit() {
    setBusy(true); setErr('');
    try {
      await api('/api/vendor/payouts', { method: 'POST', body: { amountCents: cents, method } });
      toast.success('Payout requested — the Yobou team will process it.');
      setAmount('');
      onDone();
    } catch (e) {
      setErr(e.data?.error === 'INSUFFICIENT_BALANCE' ? 'That is more than your available balance.' : 'Could not request the payout.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Request a payout"
      footer={(
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={!valid || busy} className="btn-primary disabled:opacity-60">Request {valid ? fmt(cents) : ''}</button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-on-surface-variant">Available</span>
          <button type="button" className="font-semibold text-primary" onClick={() => setAmount(String(finance.balanceCents / 100))}>
            {fmt(finance.balanceCents)} · use all
          </button>
        </div>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Amount</span>
          <input className="input mt-1" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Pay me via</span>
          <select className="input mt-1" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <p className="text-label-md text-on-surface-variant">
          Minimum {fmt(finance.minPayoutCents)}. The amount is reserved until Yobou sends it; if a payout is rejected it returns to your balance.
        </p>
        {err && <div className="text-error">{err}</div>}
      </div>
    </Modal>
  );
}
