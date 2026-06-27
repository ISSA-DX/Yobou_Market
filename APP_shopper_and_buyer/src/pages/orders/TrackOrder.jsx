import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import OrderTimeline from '../../components/OrderTimeline';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice, userLocale } from '../../lib/format';
import { useStore } from '../../store';

const REFUND_WINDOW_DAYS = 15;

export default function TrackOrder() {
  const { id } = useParams();
  const currency = useStore((s) => s.user?.currency || 'USD');
  const language = useStore((s) => s.user?.language || 'en');
  const { data, error, loading, refetch } = useApi(`/api/orders/${id}`);
  const order = data?.order;
  const locale = userLocale(language);

  // Poll every 15s for live status updates
  useEffect(() => {
    const t = setInterval(() => {
      refetch().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, [id, refetch]);

  // Compute derived values up-front so hooks never change count between renders.
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

  const showDriver = order?.status === 'SHIPPED' || order?.status === 'DELIVERED';

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

        {/* Map */}
        <div className="card aspect-[16/9] bg-gradient-to-br from-surface-high to-surface-low relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-30 dark:opacity-20"
            style={{
              backgroundImage: 'linear-gradient(var(--tw-colors-outline-variant) 1px, transparent 1px), linear-gradient(90deg, var(--tw-colors-outline-variant) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />
          {/* Animated pin */}
          <div className="absolute" style={{ top: '50%', left: '60%', animation: 'bounce 1.5s infinite' }}>
            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-float">
              <Icon name="local_shipping" />
            </div>
          </div>
          <style>{`@keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`}</style>
          <div className="absolute bottom-2 left-2 chip bg-surface">
            <Icon name="near_me" className="text-[14px] text-primary" /> Live tracking
          </div>
        </div>

        {/* Driver card */}
        {showDriver && (
          <div className="card p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold">M</div>
            <div className="flex-1">
              <div className="font-semibold">Mike R.</div>
              <div className="flex items-center gap-1 text-label-md text-on-surface-variant">
                <Icon name="star" fill className="text-secondary text-[14px]" /> 4.9 · Courier
              </div>
            </div>
            <a href="mailto:support@yobou.market" className="w-10 h-10 rounded-full bg-surface-high flex items-center justify-center" aria-label="Email support">
              <Icon name="mail" className="text-primary" />
            </a>
            <a href="tel:+18005551234" className="w-10 h-10 rounded-full bg-surface-high flex items-center justify-center" aria-label="Call support">
              <Icon name="call" className="text-primary" />
            </a>
          </div>
        )}

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
