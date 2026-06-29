import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useApi, RetryError } from '../../useApi.jsx';
import { useStore } from '../../store';
import { formatPrice } from '../../lib/format';
import { trackingUrl } from '../../lib/carrierTracking';
import { productImage } from '../../lib/productImage';
import { toast } from '../../lib/toast';

const STATUS_STYLES = {
  PLACED: 'bg-outline-variant/20 text-on-surface-variant',
  PAID: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-secondary/20 text-secondary',
  SHIPPED: 'bg-tertiary-container/20 text-tertiary',
  DELIVERED: 'bg-tertiary/20 text-tertiary',
  CANCELLED: 'bg-error/10 text-error',
  REFUNDED: 'bg-error/10 text-error',
};

export default function OrderDetail() {
  const { id } = useParams();
  const user = useStore((s) => s.user);
  const currency = user?.currency || 'USD';
  const { data, error, loading, refetch } = useApi(`/api/orders/${id}`);

  const [shipModal, setShipModal] = useState(false);
  const [carrier, setCarrier] = useState('DHL');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');
  const [shipBusy, setShipBusy] = useState(false);

  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [restoreStock, setRestoreStock] = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [err, setErr] = useState('');

  const order = data?.order;

  if (error && !data) {
    return <RetryError message="Couldn't load order." onRetry={refetch} />;
  }
  if (loading && !data) {
    return <div className="p-8 text-center text-on-surface-variant">Loading order…</div>;
  }
  if (!order) return null;

  const canShip = order.status === 'PAID' || order.status === 'PROCESSING';
  const canCancel = order.status === 'PAID' || order.status === 'PROCESSING';
  const canDeliver = order.status === 'SHIPPED';

  async function submitShip() {
    if (!carrier || !trackingNumber) {
      setErr('Carrier and tracking number are required.');
      return;
    }
    setShipBusy(true);
    setErr('');
    try {
      await api(`/api/orders/vendor/${id}/ship`, {
        method: 'POST',
        body: { carrier, trackingNumber, eta: eta || null, note: note || null },
      });
      toast.success('Order marked as shipped');
      setShipModal(false);
      refetch();
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not ship order.');
    } finally {
      setShipBusy(false);
    }
  }

  async function submitDeliver() {
    try {
      await api(`/api/orders/vendor/${id}/deliver`, { method: 'POST' });
      toast.success('Order marked as delivered');
      refetch();
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not mark delivered.');
    }
  }

  async function submitCancel() {
    if (!cancelReason.trim()) {
      setErr('A reason is required to cancel.');
      return;
    }
    setCancelBusy(true);
    setErr('');
    try {
      await api(`/api/orders/vendor/${id}/cancel`, {
        method: 'POST',
        body: { reason: cancelReason, restoreStock },
      });
      toast.success('Order cancelled');
      setCancelModal(false);
      refetch();
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not cancel order.');
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 text-label-md text-on-surface-variant mb-1">
          <Link to="/orders" className="hover:text-primary">Orders</Link>
          <Icon name="chevron_right" className="text-[16px]" />
          <span>#{order.id.slice(-8).toUpperCase()}</span>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-headline-lg font-bold">Order #{order.id.slice(-8).toUpperCase()}</h1>
            <p className="text-on-surface-variant text-sm">
              Placed {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>
          <span className={`chip ${STATUS_STYLES[order.status] || ''}`}>{order.status}</span>
        </div>
      </div>

      {err && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Items */}
          <div className="card p-5">
            <h2 className="font-bold mb-3">Items</h2>
            <ul className="divide-y divide-outline-variant/20">
              {(order.items || []).map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-3">
                  <img
                    src={productImage(it.product || {})}
                    alt=""
                    className="w-14 h-14 rounded-md object-cover bg-surface-low"
                    onError={(e) => { e.currentTarget.src = `${import.meta.env.BASE_URL}seed-images/placeholder.svg`; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold line-clamp-1">{it.product?.name || 'Item'}</div>
                    <div className="text-label-md text-on-surface-variant">Qty {it.quantity}</div>
                  </div>
                  <div className="font-semibold">{formatPrice((it.priceCents || 0) * (it.quantity || 1), currency)}</div>
                </li>
              ))}
            </ul>
          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h2 className="font-bold mb-3">Timeline</h2>
            <ol className="space-y-3">
              {(order.timeline || []).map((e, i) => (
                <li key={i} className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon name="circle" className="text-[10px]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{e.status || e.event}</span>
                      {e.actorRole && (
                        <span className="chip text-[10px]">{e.actorRole}</span>
                      )}
                    </div>
                    {e.note && <div className="text-sm text-on-surface-variant">{e.note}</div>}
                    <div className="text-label-sm text-on-surface-variant">
                      {new Date(e.createdAt).toLocaleString()}
                      {e.actorName ? ` · ${e.actorName}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-4">
          {/* Actions */}
          <div className="card p-5 space-y-3">
            <h2 className="font-bold">Actions</h2>
            {canShip && (
              <button onClick={() => setShipModal(true)} className="btn-primary w-full">
                <Icon name="local_shipping" /> Mark as shipped
              </button>
            )}
            {canDeliver && (
              <button onClick={submitDeliver} className="btn-primary w-full">
                <Icon name="task_alt" /> Mark as delivered
              </button>
            )}
            {canCancel && (
              <button onClick={() => setCancelModal(true)} className="btn-secondary w-full">
                <Icon name="cancel" /> Cancel order
              </button>
            )}
            {!canShip && !canDeliver && !canCancel && (
              <div className="text-label-md text-on-surface-variant">No actions available for this status.</div>
            )}
          </div>

          {/* Customer */}
          <div className="card p-5 space-y-2">
            <h2 className="font-bold">Customer</h2>
            <div className="text-sm">{order.user?.name || '—'}</div>
            <div className="text-label-md text-on-surface-variant">{order.user?.email || ''}</div>
          </div>

          {/* Shipping */}
          <div className="card p-5 space-y-2">
            <h2 className="font-bold">Shipping</h2>
            {order.shippingAddress ? (
              <div className="text-sm whitespace-pre-line">
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? `\n${order.shippingAddress.line2}` : ''}
                {`\n${order.shippingAddress.city}, ${order.shippingAddress.postal || ''}`}
                {`\n${order.shippingAddress.country}`}
              </div>
            ) : (
              <div className="text-label-md text-on-surface-variant">—</div>
            )}
          </div>

          {/* Tracking */}
          {order.trackingNumber && (
            <div className="card p-5 space-y-2">
              <h2 className="font-bold">Tracking</h2>
              <div className="text-sm">{order.carrier} · {order.trackingNumber}</div>
              {order.eta && <div className="text-label-md text-on-surface-variant">ETA: {new Date(order.eta).toLocaleDateString()}</div>}
              {trackingUrl(order.carrier, order.trackingNumber) && (
                <a
                  href={trackingUrl(order.carrier, order.trackingNumber)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary w-full mt-2"
                >
                  <Icon name="open_in_new" /> Track with {order.carrier}
                </a>
              )}
            </div>
          )}

          {/* Totals */}
          <div className="card p-5 space-y-2">
            <h2 className="font-bold">Totals</h2>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Subtotal</span>
              <span>{formatPrice(order.subtotalCents || order.totalCents, currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Shipping</span>
              <span>{formatPrice(order.shippingCents || 0, currency)}</span>
            </div>
            <div className="flex justify-between font-bold pt-2 border-t border-outline-variant/30">
              <span>Total</span>
              <span>{formatPrice(order.totalCents, currency)}</span>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={shipModal}
        onClose={() => setShipModal(false)}
        title="Mark order as shipped"
        footer={
          <>
            <button onClick={() => setShipModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={submitShip} disabled={shipBusy} className="btn-primary">
              {shipBusy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Ship
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-label-md text-on-surface-variant">Carrier</label>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input mt-1 w-full">
              <option value="DHL">DHL</option>
              <option value="FedEx">FedEx</option>
              <option value="UPS">UPS</option>
              <option value="USPS">USPS</option>
            </select>
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Tracking number</label>
            <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">ETA (optional)</label>
            <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className="input mt-1 w-full" />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1 w-full" rows={2} />
          </div>
        </div>
      </Modal>

      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title="Cancel order"
        footer={
          <>
            <button onClick={() => setCancelModal(false)} className="btn-secondary">Keep order</button>
            <button onClick={submitCancel} disabled={cancelBusy} className="btn-danger">
              {cancelBusy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Cancel order
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-on-surface-variant">
            Cancelling will notify the customer. Stock will be restored only for products in this order.
          </p>
          <div>
            <label className="text-label-md text-on-surface-variant">Reason</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="input mt-1 w-full"
              rows={2}
              placeholder="e.g. Out of stock, can't fulfill, customer requested…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={restoreStock} onChange={(e) => setRestoreStock(e.target.checked)} />
            Restore stock for my products in this order
          </label>
        </div>
      </Modal>
    </div>
  );
}