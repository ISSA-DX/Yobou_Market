import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';

const STATUSES = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAYMENT_METHODS = ['CARD', 'PAYPAL', 'COD'];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    paymentMethod: '',
    q: '',
    from: '',
    to: '',
  });
  const [page, setPage] = useState(0);
  const limit = 25;

  async function load() {
    setBusy(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set('status', filters.status);
      if (filters.paymentMethod) qs.set('paymentMethod', filters.paymentMethod);
      if (filters.q) qs.set('q', filters.q);
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      qs.set('limit', String(limit));
      qs.set('offset', String(page * limit));
      const data = await api(`/api/admin/orders?${qs.toString()}`);
      setOrders(data.orders || []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load orders.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  function applyFilters(e) {
    e?.preventDefault();
    setPage(0);
    load();
  }

  function resetFilters() {
    setFilters({ status: '', paymentMethod: '', q: '', from: '', to: '' });
    setPage(0);
    setTimeout(load, 0);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5">
      <h1 className="text-headline-lg font-bold">All orders</h1>

      <form onSubmit={applyFilters} className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-label-md text-on-surface-variant mb-1">Search</label>
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Order id, customer name or email"
              className="input"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input"
            >
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Payment</label>
            <select
              value={filters.paymentMethod}
              onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
              className="input"
            >
              <option value="">All</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">From</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="input" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" onClick={resetFilters} className="btn-secondary text-sm">Reset</button>
          <button type="submit" className="btn-primary text-sm">Apply filters</button>
        </div>
      </form>

      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="text-primary font-semibold">Retry</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {busy && orders.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">
                <Icon name="progress_activity" className="text-[24px] animate-spin" />
              </td></tr>
            )}
            {!busy && orders.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">No orders match.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-outline-variant/20">
                <td className="px-4 py-3 font-semibold">#{o.id.slice(-6).toUpperCase()}</td>
                <td className="px-4 py-3">{o.user?.name || '—'}</td>
                <td className="px-4 py-3">{o.items.length}</td>
                <td className="px-4 py-3 font-semibold">${(o.totalCents/100).toFixed(2)}</td>
                <td className="px-4 py-3 text-on-surface-variant">{o.paymentMethod}</td>
                <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                <td className="px-4 py-3 text-on-surface-variant text-label-sm">
                  {o.trackingNumber ? `${o.carrier || ''} ${o.trackingNumber}`.trim() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/orders/${o.id}/track`} className="text-primary font-semibold">Manage →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-on-surface-variant">
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const color =
    status === 'DELIVERED' ? 'bg-tertiary text-on-secondary' :
    status === 'SHIPPED' ? 'bg-tertiary/20 text-on-surface' :
    status === 'PROCESSING' ? 'bg-secondary/20 text-on-surface' :
    status === 'PAID' ? 'bg-primary/10 text-primary' :
    status === 'PLACED' ? 'bg-surface-high text-on-surface' :
    status === 'CANCELLED' || status === 'REFUNDED' ? 'bg-error/10 text-error' :
    'bg-surface-high';
  return (
    <span className={`px-2 py-0.5 rounded-full text-label-md font-bold ${color}`}>
      {status}
    </span>
  );
}