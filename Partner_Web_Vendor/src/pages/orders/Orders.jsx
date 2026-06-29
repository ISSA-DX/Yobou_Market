import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { useStore } from '../../store';
import { formatPrice } from '../../lib/format';

const STATUS_STYLES = {
  PLACED: 'bg-outline-variant/20 text-on-surface-variant',
  PAID: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-secondary/20 text-secondary',
  SHIPPED: 'bg-tertiary-container/20 text-tertiary',
  DELIVERED: 'bg-tertiary/20 text-tertiary',
  CANCELLED: 'bg-error/10 text-error',
  REFUNDED: 'bg-error/10 text-error',
};

const STATUS_CHIPS = [
  { v: '', label: 'All' },
  { v: 'PAID', label: 'Paid' },
  { v: 'PROCESSING', label: 'Processing' },
  { v: 'SHIPPED', label: 'Shipped' },
  { v: 'DELIVERED', label: 'Delivered' },
  { v: 'CANCELLED', label: 'Cancelled' },
];

export default function Orders() {
  const user = useStore((s) => s.user);
  const currency = user?.currency || 'USD';
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');

  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  const { data, error, loading, refetch } = useApi(`/api/orders/vendor/mine${qs ? `?${qs}` : ''}`);

  let orders = data?.orders || [];
  if (q) {
    const needle = q.toLowerCase();
    orders = orders.filter((o) =>
      o.id.toLowerCase().includes(needle) ||
      (o.user?.name || '').toLowerCase().includes(needle) ||
      (o.user?.email || '').toLowerCase().includes(needle)
    );
  }

  if (error && !data) {
    return <RetryError message="Couldn't load your orders." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-headline-lg font-bold">Orders</h1>
        <p className="text-on-surface-variant text-sm">
          Orders containing your products. You can ship + cancel from the detail page.
        </p>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
          <input
            className="input pl-10"
            placeholder="Search by order id or customer"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_CHIPS.map((s) => (
            <button
              key={s.v}
              onClick={() => setStatusFilter(s.v)}
              className={`px-3 py-1.5 rounded-full text-label-md ${
                statusFilter === s.v ? 'bg-primary text-white' : 'bg-surface-low text-on-surface-variant hover:bg-surface-high'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-label-md">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input py-1.5 px-3 text-sm" />
          <span className="text-on-surface-variant">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input py-1.5 px-3 text-sm" />
        </div>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                  <Icon name="progress_activity" className="text-[24px] animate-spin inline-block" />
                  <span className="ml-2">Loading orders…</span>
                </td>
              </tr>
            )}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                  No orders match your filters yet.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-outline-variant/20 hover:bg-surface-low">
                <td className="px-4 py-3">
                  <Link to={`/orders/${o.id}/track`} className="font-semibold hover:text-primary">
                    #{o.id.slice(-8).toUpperCase()}
                  </Link>
                  <div className="text-label-md text-on-surface-variant">{new Date(o.createdAt).toLocaleDateString()}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium line-clamp-1">{o.user?.name || '—'}</div>
                  <div className="text-label-md text-on-surface-variant line-clamp-1">{o.user?.email || ''}</div>
                </td>
                <td className="px-4 py-3">{o.items?.length || 0}</td>
                <td className="px-4 py-3 font-semibold">{formatPrice(o.totalCents, currency)}</td>
                <td className="px-4 py-3 text-on-surface-variant">{o.paymentMethod}</td>
                <td className="px-4 py-3">
                  <span className={`chip ${STATUS_STYLES[o.status] || ''}`}>{o.status}</span>
                </td>
                <td className="px-4 py-3 text-on-surface-variant text-label-md">
                  {o.carrier ? `${o.carrier} · ${o.trackingNumber}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.total != null && (
        <div className="text-label-md text-on-surface-variant text-center">
          Showing {orders.length} of {data.total}
        </div>
      )}
    </div>
  );
}