import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import OrderTimeline from '../../components/OrderTimeline';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice, userLocale } from '../../lib/format';
import { useStore } from '../../store';
import { useNotificationStream } from '../../lib/useSse';
import { trackingUrl } from '../../lib/carrierTracking';

const REFUND_WINDOW_DAYS = 15;

export default function TrackOrder() {
  const { id } = useParams();
  const currency = useStore((s) => s.user?.currency || 'USD');
  const language = useStore((s) => s.user?.language || 'en');
  const { data, error, loading, refetch } = useApi(`/api/orders/${id}`);
  const order = data?.order;
  const locale = userLocale(language);

  // SSE-driven live updates: refetch when a tracking event for THIS order
  // arrives. The server's notify() writes the orderId into `meta.orderId`.
  // Falls back to polling every 15s when SSE is offline (it auto-reconnects).
  useNotificationStream((note) => {
    const meta = parseMeta(note.meta);
    if (meta?.orderId === id) {
      refetch().catch(() => {});
    }
  });

  useEffect(() => {
    const t = setInterval(() => { refetch().catch(() => {}); }, 15000);
    return () => clearInterval(t);
  }, [id, refetch]);

  // Derived values up-front so hooks never change count between renders.
  const eta = useMemo(() => {
    if (!order) return { label: 'ETA', value: '—' };
    if (order.status === 'DELIVERED') {
      const delivered = order.timeline?.find((e) => e.status === 'DELIVERED')?.at;
      return delivered
        ? { label: 'Delivered', value: new Date(delivered).toLocaleDateString(locale, { dateStyle: 'medium' }) }
        : { label: 'Delivered', value: 'Delivered' };
    }
    if (order.status === 'CANCELLED') {
      return { label: 'Status', value: 'Cancelled' };
    }
    // Prefer the admin/vendor-set ETA if present.
    if (order.estimatedDelivery) {
      return {
        label: 'ETA',
        value: new Date(order.estimatedDelivery).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' }),
      };
    }
    const date = new Date(new Date(order.createdAt).getTime() + 2 * 86400000);
    return {
      label: 'ETA',
      value: date.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' }),
    };
  }, [order, locale]);

  const address = useMemo(() => {
    if (!order) return null;
    return {
      recipientName: order.snapshotName || order.address?.recipientName,
      line1: order.snapshotLine1 || order.address?.line1,
      city: order.snapshotCity || order.address?.city,
      state: order.snapshotState || order.address?.state,
      postal: order.snapshotPostal || order.address?.postal,
    };
  }, [order]);

  // Refund eligibility: only when DELIVERED and within the 15-day window of delivery.
  const refundEligibility = useMemo(() => {
    if (!order || order.status !== 'DELIVERED') return { eligible: false, reason: '' };
    const deliveredAt = order.timeline?.find((e) => e.status === 'DELIVERED')?.at
      || order.updatedAt;
    const days = (Date.now() - new Date(deliveredAt).getTime()) / (24 * 60 * 60 * 1000);
    if (days > REFUND_WINDOW_DAYS) {
      return { eligible: false, reason: `Refund window of ${REFUND_WINDOW_DAYS} days has passed.` };
    }
    return { eligible: true, reason: '', deliveredAt };
  }, [order]);

  if (error && !data) {
    return <RetryError message="Couldn't load this order." onRetry={refetch} />;
  }
  if (loading && !order) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <Icon name="progress_activity" className="text-[32px] animate-spin" />
        <div className="mt-3 text-sm">Loading order…</div>
      </div>
    );
  }
  if (!order) return <div className="p-8 text-center text-on-surface-variant">Loading order…</div>;

  const carrierUrl = trackingUrl(order.carrier, order.trackingNumber);
  const showTracking = !!order.trackingNumber;

  return (
    <div className="pb-24">
      <header className="flex items-center justify-between px-4 h-14">
        <Link to="/orders" className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></Link>
        <h1 className="font-bold">Track Order</h1>
        <Link to="/cart" className="p-2"><Icon name="shopping_bag" className="text-[24px]" /></Link>
      </header>

      <div className="px-4 space-y-4">
        {/* Top bento */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bento">
            <div className="text-label-md text-on-surface-variant">Order ID</div>
            <div className="font-bold mt-1">#{order.id.slice(-6).toUpperCase()}</div>
          </div>
          <div className="bento">
            <div className="text-label-md text-on-surface-variant">{eta.label}</div>
            <div className="font-bold mt-1 text-sm">{eta.value}</div>
          </div>
          <div className="bento">
            <div className="text-label-md text-on-surface-variant">Status</div>
            <div className="font-bold mt-1 text-sm">{order.status}</div>
          </div>
        </div>

        {/* Live tracking card — replaces the placeholder map + driver */}
        <TrackingCard order={order} carrierUrl={carrierUrl} />

        {/* Timeline */}
        <div className="card p-4">
          <h3 className="font-bold mb-3">Order status</h3>
          <OrderTimeline currentStatus={order.status} events={order.timeline} />
        </div>

        {/* Delivery address */}
        {address?.line1 && (
          <div className="card p-4">
            <div className="text-label-md text-on-surface-variant">Delivering to</div>
            {address.recipientName && (
              <div className="font-semibold mt-1">{address.recipientName}</div>
            )}
            <div className={`${address.recipientName ? 'text-on-surface-variant text-sm' : 'font-semibold mt-1'}`}>
              {address.line1}, {address.city}, {address.state} {address.postal}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="card p-4">
          <h3 className="font-bold mb-3">Items in this order</h3>
          <div className="space-y-3">
            {(order.items || []).map((it) => {
              if (!it?.product) return null;
              const lineTotal = (it.priceCents || 0) * (it.quantity || 1);
              return (
                <div key={it.id} className="flex items-center gap-3">
                  <img
                    src={productImage(it.product)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-14 h-14 rounded-md object-cover bg-surface-low"
                    onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold line-clamp-1">{it.product.name}</div>
                    <div className="text-label-md text-on-surface-variant">
                      Qty {it.quantity} · {formatPrice(it.priceCents, currency, language)} each
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatPrice(lineTotal, currency, language)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
            <span className="text-on-surface-variant text-sm">Total</span>
            <span className="font-bold text-lg">{formatPrice(order.totalCents, currency, language)}</span>
          </div>
        </div>

        {/* Cancel reason (when admin cancelled this order) */}
        {order.status === 'CANCELLED' && order.cancelReason && (
          <div className="card p-4 bg-error/10 text-error flex items-start gap-3">
            <Icon name="block" className="text-[20px] mt-0.5" />
            <div>
              <div className="font-semibold">This order was cancelled</div>
              <div className="text-sm">{order.cancelReason}</div>
            </div>
          </div>
        )}

        {/* Refund */}
        {(order.status === 'DELIVERED' || order.status === 'REFUNDED') && (
          <RefundSection
            order={order}
            eligibility={refundEligibility}
            onRefunded={() => refetch()}
          />
        )}
      </div>
    </div>
  );
}

// TrackingCard — shows the real carrier + tracking number (with outbound link
// when we know the carrier's URL), shipped-at, and ETA. Replaces the old
// placeholder map + fake driver.
function TrackingCard({ order, carrierUrl }) {
  if (order.status === 'PLACED' || order.status === 'PAID') {
    return (
      <div className="card p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-surface-high flex items-center justify-center flex-shrink-0">
          <Icon name="inventory_2" className="text-primary" />
        </div>
        <div>
          <div className="font-semibold">Preparing your order</div>
          <div className="text-sm text-on-surface-variant">
            We'll add tracking info here as soon as the vendor ships your package.
          </div>
        </div>
      </div>
    );
  }

  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') return null;

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
          <Icon name="local_shipping" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {order.status === 'DELIVERED' ? 'Delivered' : 'In transit'}
          </div>
          <div className="text-sm text-on-surface-variant">
            {order.carrier || 'Carrier'}
            {order.trackingNumber ? ` · ${order.trackingNumber}` : ''}
          </div>
        </div>
        {carrierUrl && (
          <a
            href={carrierUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary font-semibold text-sm whitespace-nowrap"
          >
            Track ↗
          </a>
        )}
      </div>
      {order.shippedAt && (
        <div className="text-label-sm text-on-surface-variant">
          Shipped: {new Date(order.shippedAt).toLocaleString()}
        </div>
      )}
      {order.estimatedDelivery && order.status !== 'DELIVERED' && (
        <div className="text-label-sm text-on-surface-variant">
          Estimated delivery: {new Date(order.estimatedDelivery).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

function RefundSection({ order, eligibility, onRefunded }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  async function submit() {
    if (reason.trim().length < 3) {
      setErr('Please describe why you want a refund.');
      return;
    }
    setBusy(true); setErr('');
    try {
      await api('/api/refunds', { method: 'POST', body: { orderId: order.id, reason: reason.trim() } });
      setOpen(false);
      setReason('');
      onRefunded();
    } catch (e) {
      setErr(e.data?.error === 'REFUND_WINDOW_EXPIRED'
        ? 'Refund window has passed.'
        : e.data?.error === 'REFUND_ALREADY_EXISTS'
        ? 'You already have a refund request for this order.'
        : (e.data?.error || 'Could not submit refund request.'));
    } finally {
      setBusy(false);
    }
  }

  if (order.status === 'REFUNDED') {
    return (
      <div className="card p-4 bg-tertiary-container/20 text-tertiary flex items-start gap-3">
        <Icon name="check_circle" className="text-[24px]" />
        <div>
          <div className="font-semibold">This order has been refunded.</div>
          <div className="text-label-md">Stock has been restored and any card payment will appear on your statement.</div>
        </div>
      </div>
    );
  }

  if (!eligibility.eligible) {
    return (
      <div className="card p-4 flex items-start gap-3 text-on-surface-variant">
        <Icon name="info" className="text-[24px]" />
        <div>
          <div className="font-semibold">Refund window closed</div>
          <div className="text-label-md">{eligibility.reason}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold flex items-center gap-2">
            <Icon name="assignment_return" className="text-primary" />
            Request a refund
          </div>
          <div className="text-label-md text-on-surface-variant mt-1">
            You're within the {REFUND_WINDOW_DAYS}-day refund window. Submit a request and our team will review it.
          </div>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="btn-secondary py-2 px-3">Request refund</button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <textarea
            className="input min-h-24"
            placeholder="Tell us what's wrong (item damaged, wrong size, didn't arrive as described, etc.)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />
          {err && (
            <div className="text-error text-sm flex items-center gap-1">
              <Icon name="error" className="text-[18px]" /> {err}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setOpen(false); setErr(''); }} className="btn-ghost py-2 px-3">Cancel</button>
            <button onClick={submit} disabled={busy} className="btn-primary flex-1">
              {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Submit request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The server stores `meta` as a JSON string on the Notification row; tolerate
// both string and object forms so we don't crash on schema drift.
function parseMeta(meta) {
  if (!meta) return null;
  if (typeof meta !== 'string') return meta;
  try { return JSON.parse(meta); } catch { return null; }
}