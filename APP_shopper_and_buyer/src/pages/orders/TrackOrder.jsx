import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import OrderTimeline from '../../components/OrderTimeline';
import LiveTracking from '../../components/LiveTracking';
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
        <StatusHero order={order} eta={eta} locale={locale} />

        {/* Store/carrier shipment details — Yobou-courier orders show the
            live courier card below instead. */}
        {!order.delivery && <TrackingCard order={order} carrierUrl={carrierUrl} />}
        {order.delivery && <div className="reveal reveal-blur"><LiveTracking orderId={order.id} title="Your Yobou courier" /></div>}

        {/* Timeline */}
        <div className="reveal reveal-wipe card p-4">
          <h3 className="font-bold mb-3">Order status</h3>
          <OrderTimeline currentStatus={order.status} events={order.timeline} />
        </div>

        {/* Delivery address */}
        {address?.line1 && (
          <div className="reveal reveal-slide-right card p-4">
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
        <div className="reveal reveal-fade-up card p-4">
          <h3 className="font-bold mb-3">Items in this order</h3>
          <div className="reveal-stagger stagger-left space-y-3">
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
// Status hero — the one-glance answer to "where is my order?".
const HERO = {
  PLACED: { icon: 'receipt_long', title: 'Order received', tone: 'from-slate-700 to-slate-500' },
  PAID: { icon: 'verified', title: 'Order confirmed', tone: 'from-[#0a2a8f] to-primary-container' },
  PROCESSING: { icon: 'inventory_2', title: 'Being prepared', tone: 'from-amber-600 to-amber-400' },
  SHIPPED: { icon: 'local_shipping', title: 'On the way', tone: 'from-[#0a2a8f] to-primary-container' },
  DELIVERED: { icon: 'task_alt', title: 'Delivered', tone: 'from-emerald-700 to-emerald-500' },
  CANCELLED: { icon: 'block', title: 'Order cancelled', tone: 'from-rose-700 to-rose-500' },
  REFUNDED: { icon: 'currency_exchange', title: 'Refunded', tone: 'from-slate-700 to-slate-500' },
};
const HERO_STEPS = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

function StatusHero({ order, eta, locale }) {
  const h = HERO[order.status] || HERO.PLACED;
  const closed = ['CANCELLED', 'REFUNDED'].includes(order.status);
  const reached = HERO_STEPS.indexOf(order.status);
  const sub = order.status === 'DELIVERED'
    ? 'Enjoy your purchase — you can rate it or request a refund below.'
    : closed
      ? (order.cancelReason ? `Reason: ${order.cancelReason}` : 'This order is closed.')
      : order.status === 'PLACED'
        ? (order.paymentMethod === 'COD' ? 'Pay on delivery · the store is getting it ready.' : 'Waiting for payment confirmation.')
        : `${eta.label === 'ETA' ? 'Arriving' : eta.label} ${eta.value}`;

  return (
    <section className={`reveal reveal-zoom anim-shine relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br ${h.tone} shadow-float`}>
      <div className="pointer-events-none absolute -right-8 -top-10 w-40 h-40 rounded-full bg-white/10" />
      <div className="relative flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
          <Icon name={h.icon} className="text-[30px]" fill />
        </div>
        <div className="flex-1 min-w-0">
          {/* text-white: overrides the global h2 colour on the gradient. */}
          <h2 className="text-headline-md font-extrabold text-white">{h.title}</h2>
          <p className="mt-0.5 text-sm text-white/85">{sub}</p>
          <p className="mt-2 text-label-md text-white/70">
            Order #{order.id.slice(-8).toUpperCase()} · {new Date(order.createdAt).toLocaleDateString(locale, { dateStyle: 'medium' })}
          </p>
        </div>
      </div>
      {!closed && (
        <div className="relative mt-4 grid grid-cols-4 gap-1.5">
          {['Confirmed', 'Preparing', 'On the way', 'Delivered'].map((label, i) => (
            <div key={label}>
              <div className={`h-1.5 rounded-full ${i <= reached ? 'bg-white' : 'bg-white/25'}`} />
              <div className={`mt-1 text-[10px] font-semibold ${i <= reached ? 'text-white' : 'text-white/60'}`}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TrackingCard({ order, carrierUrl }) {
  // Before shipping, the status hero already explains what is happening.
  if (!['SHIPPED', 'DELIVERED'].includes(order.status)) return null;
  if (!order.carrier && !order.trackingNumber && !order.shippedAt) return null;

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
          <Icon name="local_shipping" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {order.carrier ? `Shipped with ${order.carrier}` : 'Shipped by the store'}
          </div>
          <div className="text-sm text-on-surface-variant">
            {order.trackingNumber ? `Tracking ${order.trackingNumber}` : 'No tracking number yet'}
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
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary py-2 px-3">Request refund</button>
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
            <button type="button" onClick={() => { setOpen(false); setErr(''); }} className="btn-ghost py-2 px-3">Cancel</button>
            <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1">
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