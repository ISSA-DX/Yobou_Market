import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';

const STATUSES = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const NEXT = {
  PAID: 'PROCESSING',
  PROCESSING: 'SHIPPED',
  SHIPPED: 'DELIVERED',
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try {
      const { orders } = await api('/api/orders');
      setOrders(orders);
    } catch {
      setError('Could not load orders.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function advance(o) {
    const next = NEXT[o.status];
    if (!next) return;
    try {
      await api(`/api/orders/${o.id}/status`, { method: 'PATCH', body: { status: next } });
      await load();
    } catch {
      setError('Could not update order status.');
    }
  }

  async function setStatus(o, status) {
    try {
      await api(`/api/orders/${o.id}/status`, { method: 'PATCH', body: { status } });
      await load();
    } catch {
      setError('Could not update order status.');
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-headline-lg font-bold">All orders</h1>

      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="text-primary font-semibold">Retry</button>
        </div>
      )}

      {busy && orders.length === 0 && (
        <div className="text-center py-12 text-on-surface-variant">
          <Icon name="progress_activity" className="text-[32px] animate-spin" />
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
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && !busy && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">No orders yet.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-outline-variant/20">
                <td className="px-4 py-3 font-semibold">#{o.id.slice(-6).toUpperCase()}</td>
                <td className="px-4 py-3">{o.user?.name || '—'}</td>
                <td className="px-4 py-3">{o.items.length}</td>
                <td className="px-4 py-3 font-semibold">${(o.totalCents/100).toFixed(2)}</td>
                <td className="px-4 py-3 text-on-surface-variant">{o.paymentMethod}</td>
                <td className="px-4 py-3">
                  <select
                    value={o.status}
                    onChange={(e) => setStatus(o, e.target.value)}
                    className="input py-1.5 text-sm w-36"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s} disabled={s === 'REFUNDED'}>
                        {s}{s === 'REFUNDED' ? ' (via refund flow)' : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Link to={`/orders/${o.id}/track`} className="text-primary font-semibold">View</Link>
                  {o.status === 'DELIVERED' && (
                    <Link to="/refunds" className="text-secondary font-semibold" title="Refund requests">
                      Refund
                    </Link>
                  )}
                  {NEXT[o.status] && (
                    <button onClick={() => advance(o)} className="text-tertiary font-semibold">
                      → {NEXT[o.status]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}