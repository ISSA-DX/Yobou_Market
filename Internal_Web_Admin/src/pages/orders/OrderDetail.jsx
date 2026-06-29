// Admin order detail — single source of truth for managing an order.
//
// Sections:
//   - Summary card (order id, placed at, total, payment method, status pill)
//   - Items list (image, name, vendor, qty, line total)
//   - Customer + shipping address (snapshot)
//   - Tracking editor (carrier select + tracking number + ETA)
//   - Timeline (TimelineEvent rows with actor + note)
//   - Cancel modal (admin only, reason required, restores stock by default)
//   - Ship modal (tracking + carrier + ETA)
//   - Refund button → existing /api/refunds flow
//
// URL: /orders/:id/track  (was referenced in Orders.jsx but never registered).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';

const STATUS_COLORS = {
  PLACED: 'bg-surface-high text-on-surface',
  PAID: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-secondary/20 text-on-surface',
  SHIPPED: 'bg-tertiary/20 text-on-surface',
  DELIVERED: 'bg-tertiary text-on-secondary',
  CANCELLED: 'bg-error/10 text-error',
  REFUNDED: 'bg-error/20 text-error',
};

const CARRIERS = ['DHL', 'FedEx', 'UPS', 'USPS', 'YobouDirect', 'Other'];

function StatusPill({ status }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-label-md font-bold ${STATUS_COLORS[status] || 'bg-surface-high'}`}>
      {status}
    </span>
  );
}

function fmtMoney(cents) { return `$${(cents / 100).toFixed(2)}`; }
function fmtDate(iso) { if (!iso) return '—'; return new Date(iso).toLocaleString(); }

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await api(`/api/admin/orders/${id}`);
      setOrder(res.order);
    } catch (e) {
      setError(e?.data?.error === 'NOT_FOUND' ? 'Order not found.' : 'Could not load order.');
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (busy && !order) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        <Icon name="progress_activity" className="text-[32px] animate-spin" />
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="card p-6 bg-error/10 text-error">
        {error}
        <button onClick={() => navigate('/orders')} className="ml-3 text-primary font-semibold">Back to orders</button>
      </div>
    );
  }

  if (!order) return null;

  const canCancel = !['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status);
  const canShip = ['PAID', 'PROCESSING'].includes(order.status);
  const canRefund = order.status === 'DELIVERED';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <div className="text-label-md text-on-surface-variant">
            <Link to="/orders" className="hover:underline">← All orders</Link>
          </div>
          <h1 className="text-headline-lg font-bold">
            Order #{order.id.slice(-6).toUpperCase()}
          </h1>
          <div className="text-sm text-on-surface-variant">Placed {fmtDate(order.createdAt)}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={order.status} />
          {canCancel && (
            <button onClick={() => setCancelOpen(true)} className="btn-secondary text-error">
              <Icon name="block" className="text-[18px]" /> Cancel order
            </button>
          )}
          {canShip && (
            <button onClick={() => setShipOpen(true)} className="btn-primary">
              <Icon name="local_shipping" className="text-[18px]" /> Mark shipped
            </button>
          )}
          {canRefund && (
            <Link to="/refunds" className="btn-secondary">
              <Icon name="undo" className="text-[18px]" /> Issue refund
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="card p-3 bg-error/10 text-error text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Items */}
          <section className="card p-5">
            <h2 className="font-bold text-lg mb-3">Items</h2>
            <div className="divide-y divide-outline-variant/20">
              {order.items.map((it) => (
                <div key={it.id} className="flex items-center gap-4 py-3">
                  <div className="w-16 h-16 rounded-md bg-surface-low overflow-hidden flex-shrink-0">
                    {it.product?.images?.[0] ? (
                      <img src={it.product.images[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                        <Icon name="image" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{it.product?.title || 'Removed product'}</div>
                    <div className="text-sm text-on-surface-variant">
                      {it.product?.vendor?.businessName ? `${it.product.vendor.businessName} · ` : ''}qty {it.qty}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmtMoney(it.lineTotalCents)}</div>
                    <div className="text-label-md text-on-surface-variant">{fmtMoney(it.priceCents)} ea</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-outline-variant/30 mt-3 pt-3 flex justify-end gap-6 text-sm">
              <div className="text-on-surface-variant">Subtotal</div>
              <div className="font-semibold">{fmtMoney(order.subtotalCents)}</div>
            </div>
            <div className="flex justify-end gap-6 text-sm">
              <div className="text-on-surface-variant">Shipping</div>
              <div className="font-semibold">{fmtMoney(order.shippingCents)}</div>
            </div>
            <div className="flex justify-end gap-6 text-sm">
              <div className="text-on-surface-variant">Tax</div>
              <div className="font-semibold">{fmtMoney(order.taxCents)}</div>
            </div>
            <div className="flex justify-end gap-6 mt-2 text-base">
              <div className="font-bold">Total</div>
              <div className="font-bold">{fmtMoney(order.totalCents)}</div>
            </div>
          </section>

          {/* Tracking */}
          <TrackingSection order={order} onUpdated={load} />

          {/* Timeline */}
          <section className="card p-5">
            <h2 className="font-bold text-lg mb-3">Timeline</h2>
            <ol className="space-y-3">
              {order.timeline?.length ? order.timeline.map((ev) => (
                <li key={ev.id} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{ev.status}</span>
                      <span className="text-on-surface-variant">· {fmtDate(ev.at)}</span>
                      {ev.actorRole && (
                        <span className="text-label-sm px-1.5 py-0.5 rounded bg-surface-high text-on-surface-variant">
                          {ev.actorRole}
                        </span>
                      )}
                    </div>
                    {ev.note && <div className="text-sm text-on-surface-variant mt-0.5">{ev.note}</div>}
                  </div>
                </li>
              )) : (
                <li className="text-on-surface-variant text-sm">No timeline events yet.</li>
              )}
            </ol>
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          {/* Customer */}
          <section className="card p-5">
            <h2 className="font-bold text-lg mb-2">Customer</h2>
            <div className="font-medium">{order.user?.name || '—'}</div>
            <div className="text-sm text-on-surface-variant">{order.user?.email}</div>
          </section>

          {/* Shipping */}
          <section className="card p-5">
            <h2 className="font-bold text-lg mb-2">Shipping address</h2>
            {order.shippingAddress ? (
              <address className="not-italic text-sm space-y-0.5">
                <div>{order.shippingAddress.line1}</div>
                {order.shippingAddress.line2 && <div>{order.shippingAddress.line2}</div>}
                <div>
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
                </div>
                <div>{order.shippingAddress.country}</div>
              </address>
            ) : (
              <div className="text-sm text-on-surface-variant">No shipping address.</div>
            )}
          </section>

          {/* Payment */}
          <section className="card p-5">
            <h2 className="font-bold text-lg mb-2">Payment</h2>
            <div className="text-sm">Method: <span className="font-medium">{order.paymentMethod}</span></div>
            <div className="text-sm">Status: <span className="font-medium">{order.paymentStatus || '—'}</span></div>
          </section>
        </div>
      </div>

      {/* Modals */}
      <CancelModal
        open={cancelOpen}
        order={order}
        onClose={() => setCancelOpen(false)}
        onDone={() => { setCancelOpen(false); load(); }}
      />
      <ShipModal
        open={shipOpen}
        order={order}
        onClose={() => setShipOpen(false)}
        onDone={() => { setShipOpen(false); load(); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracking section — inline editor for carrier/tracking/ETA, plus outbound link
// to the carrier's tracking page when a number is present.
// ---------------------------------------------------------------------------
function TrackingSection({ order, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [carrier, setCarrier] = useState(order.carrier || '');
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '');
  const [estimatedDelivery, setEstimatedDelivery] = useState(
    order.estimatedDelivery ? order.estimatedDelivery.slice(0, 10) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Re-sync when the order prop changes (e.g. after refetch).
  useEffect(() => {
    setCarrier(order.carrier || '');
    setTrackingNumber(order.trackingNumber || '');
    setEstimatedDelivery(order.estimatedDelivery ? order.estimatedDelivery.slice(0, 10) : '');
  }, [order.carrier, order.trackingNumber, order.estimatedDelivery]);

  async function save() {
    setBusy(true); setError('');
    try {
      await api(`/api/admin/orders/${order.id}`, {
        method: 'PATCH',
        body: {
          carrier: carrier || null,
          trackingNumber: trackingNumber || null,
          estimatedDelivery: estimatedDelivery || null,
        },
      });
      setEditing(false);
      onUpdated();
    } catch (e) {
      setError(e?.data?.error === 'NO_CHANGES' ? 'Change something to save.' : 'Could not save tracking.');
    } finally {
      setBusy(false);
    }
  }

  const carrierUrl = trackingUrl(carrier, trackingNumber);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-lg">Tracking</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-primary font-semibold text-sm">Edit</button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Carrier</label>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input">
              <option value="">—</option>
              {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Tracking number</label>
            <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Estimated delivery</label>
            <input
              type="date"
              value={estimatedDelivery}
              onChange={(e) => setEstimatedDelivery(e.target.value)}
              className="input"
            />
          </div>
          {error && <div className="text-sm text-error">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
            <button onClick={save} disabled={busy} className="btn-primary disabled:opacity-50">
              {busy ? 'Saving…' : 'Save tracking'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <div>Carrier: <span className="font-medium">{order.carrier || '—'}</span></div>
          <div>
            Tracking #:{' '}
            {order.trackingNumber ? (
              carrierUrl ? (
                <a href={carrierUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                  {order.trackingNumber} ↗
                </a>
              ) : (
                <span className="font-medium">{order.trackingNumber}</span>
              )
            ) : '—'}
          </div>
          <div>Shipped at: <span className="font-medium">{fmtDate(order.shippedAt)}</span></div>
          <div>ETA: <span className="font-medium">{fmtDate(order.estimatedDelivery)}</span></div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cancel modal — admin-only, reason required, restores stock by default.
// ---------------------------------------------------------------------------
function CancelModal({ open, order, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [restoreStock, setRestoreStock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset state when reopened.
  useEffect(() => {
    if (open) { setReason(''); setRestoreStock(true); setError(''); }
  }, [open]);

  async function submit() {
    if (reason.trim().length < 3) {
      setError('Reason must be at least 3 characters.');
      return;
    }
    setBusy(true); setError('');
    try {
      await api(`/api/admin/orders/${order.id}/cancel`, {
        method: 'POST',
        body: { reason: reason.trim(), restoreStock },
      });
      onDone();
    } catch (e) {
      setError(e?.data?.error === 'INVALID_INPUT' ? 'Reason must be 3-500 characters.' : 'Could not cancel order.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel order"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Keep order</button>
          <button onClick={submit} disabled={busy} className="btn-primary bg-error hover:bg-error/90 disabled:opacity-50">
            {busy ? 'Cancelling…' : 'Cancel order'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-on-surface-variant">
          The customer and the vendor will both receive an in-app notification. This cannot be undone.
        </p>
        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Reason (visible to customer)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="input"
            placeholder="e.g. Out of stock; vendor unable to fulfill"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={restoreStock}
            onChange={(e) => setRestoreStock(e.target.checked)}
            className="rounded"
          />
          Restore product stock
        </label>
        {error && <div className="text-sm text-error">{error}</div>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Ship modal — sets tracking + carrier + ETA and flips status to SHIPPED.
// ---------------------------------------------------------------------------
function ShipModal({ open, order, onClose, onDone }) {
  const [carrier, setCarrier] = useState(order.carrier || 'YobouDirect');
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '');
  const [estimatedDelivery, setEstimatedDelivery] = useState(
    order.estimatedDelivery ? order.estimatedDelivery.slice(0, 10) : ''
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setCarrier(order.carrier || 'YobouDirect');
      setTrackingNumber(order.trackingNumber || '');
      setEstimatedDelivery(order.estimatedDelivery ? order.estimatedDelivery.slice(0, 10) : '');
      setNote('');
      setError('');
    }
  }, [open, order]);

  async function submit() {
    if (trackingNumber.trim().length < 1) {
      setError('Tracking number is required.');
      return;
    }
    setBusy(true); setError('');
    try {
      await api(`/api/admin/orders/${order.id}/ship`, {
        method: 'POST',
        body: {
          carrier,
          trackingNumber: trackingNumber.trim(),
          estimatedDelivery: estimatedDelivery || undefined,
          note: note.trim() || undefined,
        },
      });
      onDone();
    } catch (e) {
      const code = e?.data?.error;
      setError(
        code === 'INVALID_INPUT' ? 'Check the tracking fields.' :
        code === 'BAD_STATE' ? 'Order is not in a state that can be shipped.' :
        'Could not ship order.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark order shipped"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary disabled:opacity-50">
            {busy ? 'Shipping…' : 'Mark shipped'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Carrier</label>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input">
            {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Tracking number</label>
          <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Estimated delivery</label>
          <input type="date" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-label-md text-on-surface-variant mb-1">Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="e.g. Left at front desk" />
        </div>
        {error && <div className="text-sm text-error">{error}</div>}
      </div>
    </Modal>
  );
}

// Carrier → outbound tracking URL. Returns null if unknown / no number.
function trackingUrl(carrier, num) {
  if (!carrier || !num) return null;
  const n = encodeURIComponent(num);
  switch (carrier) {
    case 'DHL': return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
    case 'FedEx': return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case 'UPS': return `https://www.ups.com/track?tracknum=${n}`;
    case 'USPS': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    default: return null;
  }
}