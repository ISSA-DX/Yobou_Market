import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice, userLocale } from '../../lib/format';
import { useStore } from '../../store';
import { useNotificationStream } from '../../lib/useSse';
import { toast } from '../../lib/toast';

// Human-readable label per status for the live-update banner.
const STATUS_LABEL = {
  PAID: 'paid',
  PROCESSING: 'is being prepared',
  SHIPPED: 'just shipped',
  DELIVERED: 'was delivered',
  CANCELLED: 'was cancelled',
  REFUNDED: 'was refunded',
};

// Progress through the order journey, shown as a segmented bar.
const JOURNEY = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const ACTIVE = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED'];

const TABS = [
  ['all', 'All'],
  ['active', 'In progress'],
  ['delivered', 'Delivered'],
  ['closed', 'Cancelled'],
];

function journeyStep(o) {
  // COD orders stay PLACED until the door but are still "confirmed".
  const i = JOURNEY.indexOf(o.status);
  return i < 0 ? 0 : i;
}

export default function Orders() {
  const navigate = useNavigate();
  const currency = useStore((s) => s.user?.currency || 'USD');
  const language = useStore((s) => s.user?.language || 'en');
  const { data, error, loading, refetch } = useApi('/api/orders');
  const orders = data?.orders || [];
  const [tab, setTab] = useState('all');
  const [busyId, setBusyId] = useState(null);

  // Banner state — shows the most recent order_status / tracking_updated /
  // order_cancelled push we received in the background.
  const [banner, setBanner] = useState(null);

  useNotificationStream((note) => {
    const meta = parseMeta(note.meta);
    const statusKind = ['order_status', 'tracking_updated', 'order_cancelled'].includes(note.kind);
    if (!statusKind) return;
    if (!meta?.orderId) return;
    setBanner({
      orderId: meta.orderId,
      status: meta.status || (note.kind === 'tracking_updated' ? 'SHIPPED' : note.kind.replace('order_', '').toUpperCase()),
      title: note.title,
      ts: Date.now(),
    });
    // Refetch so the card reflects the new status.
    refetch().catch(() => {});
    setTimeout(() => setBanner(null), 8000);
  });

  const counts = useMemo(() => ({
    all: orders.length,
    active: orders.filter((o) => ACTIVE.includes(o.status)).length,
    delivered: orders.filter((o) => o.status === 'DELIVERED').length,
    closed: orders.filter((o) => ['CANCELLED', 'REFUNDED'].includes(o.status)).length,
  }), [orders]);

  const visible = orders.filter((o) => {
    if (tab === 'active') return ACTIVE.includes(o.status);
    if (tab === 'delivered') return o.status === 'DELIVERED';
    if (tab === 'closed') return ['CANCELLED', 'REFUNDED'].includes(o.status);
    return true;
  });

  // "Buy again" — put the order's still-available items back in the cart.
  async function buyAgain(o) {
    setBusyId(o.id);
    let added = 0;
    for (const it of o.items || []) {
      if (!it?.product || it.product.status !== 'LIVE' || it.product.stock < 1) continue;
      try {
        await api('/api/cart', { method: 'POST', body: { productId: it.productId, quantity: Math.min(it.quantity, it.product.stock) } });
        added += 1;
      } catch { /* skip unavailable lines */ }
    }
    setBusyId(null);
    if (added === 0) {
      toast.error('These items are no longer available.');
      return;
    }
    await useStore.getState().refreshCartCount();
    toast.success(`${added} item${added === 1 ? '' : 's'} added to your cart`);
    navigate('/cart');
  }

  if (error && !data) {
    return <RetryError message="Couldn't load your orders." onRetry={refetch} />;
  }
  if (loading && !data) {
    return (
      <div className="px-4 pt-4 space-y-3">
        <div className="h-8 w-40 skeleton" />
        {[0, 1, 2].map((i) => <div key={i} className="h-40 skeleton rounded-lg" />)}
      </div>
    );
  }

  const locale = userLocale(language);

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <div className="reveal reveal-fade-down flex items-end justify-between">
        <div>
          <h1 className="page-title">My orders</h1>
          <p className="page-subtitle">{orders.length} order{orders.length === 1 ? '' : 's'} · track, re-order or get help</p>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="reveal-stagger stagger-left flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" style={{ '--stagger-step': '50ms' }}>
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-label-md font-semibold border transition ${
                tab === key ? 'bg-on-surface text-white border-on-surface' : 'bg-white text-on-surface-variant border-outline-variant hover:border-outline'
              }`}
            >
              {label}<span className={`ml-1.5 ${tab === key ? 'text-white/70' : 'text-on-surface-variant/70'}`}>{counts[key]}</span>
            </button>
          ))}
        </div>
      )}

      {banner && (
        <Link
          to={`/orders/${banner.orderId}/track`}
          onClick={() => setBanner(null)}
          className="reveal reveal-pop block card p-3 bg-primary/5 border-primary/30"
        >
          <div className="flex items-center gap-2">
            <Icon name="notifications_active" className="text-primary text-[20px]" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{banner.title}</div>
              <div className="text-label-md text-on-surface-variant">
                Order #{banner.orderId.slice(-6).toUpperCase()} {STATUS_LABEL[banner.status] || 'updated'} · Tap to view
              </div>
            </div>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </div>
        </Link>
      )}

      {orders.length === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-on-surface-variant">No orders in this view.</div>
      ) : (
        <div className="reveal-stagger stagger-tilt space-y-3">
          {visible.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              locale={locale}
              currency={currency}
              language={language}
              highlight={banner?.orderId === o.id}
              busy={busyId === o.id}
              onBuyAgain={() => buyAgain(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order: o, locale, currency, language, highlight, busy, onBuyAgain }) {
  const items = (o.items || []).filter((it) => it?.product);
  const units = items.reduce((s, it) => s + it.quantity, 0);
  const closed = ['CANCELLED', 'REFUNDED'].includes(o.status);
  const step = journeyStep(o);
  const refund = o.refunds?.[0];
  const title = items[0]?.product?.name || 'Order';

  return (
    <article className={`card overflow-hidden ${highlight ? 'ring-2 ring-primary/40' : ''}`}>
      <Link to={`/orders/${o.id}/track`} className="block p-4 press">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-label-md text-on-surface-variant">
              #{o.id.slice(-8).toUpperCase()} · {o.createdAt ? new Date(o.createdAt).toLocaleDateString(locale, { dateStyle: 'medium' }) : ''}
            </div>
          </div>
          <StatusBadge status={o.status} />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex -space-x-3 shrink-0">
            {items.slice(0, 3).map((it, i) => (
              <img
                key={it.id}
                src={productImage(it.product)}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-14 h-14 rounded-md object-cover bg-surface-low ring-2 ring-white"
                style={{ zIndex: 3 - i }}
                onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
              />
            ))}
            {items.length > 3 && (
              <div className="w-14 h-14 rounded-md bg-surface-high ring-2 ring-white flex items-center justify-center text-label-md font-bold text-on-surface-variant">
                +{items.length - 3}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm line-clamp-1">{title}</div>
            <div className="text-label-md text-on-surface-variant">
              {items.length > 1 ? `and ${items.length - 1} more · ` : ''}{units} item{units === 1 ? '' : 's'}
            </div>
            <div className="mt-0.5 font-extrabold text-on-surface">{formatPrice(o.totalCents, currency, language)}</div>
          </div>
          <Icon name="chevron_right" className="text-on-surface-variant" />
        </div>

        {/* Journey bar */}
        <div className="mt-3 flex gap-1" aria-label={`Progress: ${o.status}`}>
          {JOURNEY.slice(1).map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                closed ? 'bg-rose-200' : i < step ? (o.status === 'DELIVERED' ? 'bg-emerald-500' : 'bg-primary') : 'bg-surface-high'
              }`}
            />
          ))}
        </div>
        {refund && (
          <div className="mt-2 text-label-md text-on-surface-variant flex items-center gap-1.5">
            <Icon name="assignment_return" className="text-[16px]" /> Refund <StatusBadge status={refund.status} />
          </div>
        )}
      </Link>

      <div className="flex border-t border-outline-variant/50 divide-x divide-outline-variant/50">
        <Link to={`/orders/${o.id}/track`} className="flex-1 py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary/5">
          {ACTIVE.includes(o.status) ? 'Track order' : 'View details'}
        </Link>
        {(o.status === 'DELIVERED' || closed) && (
          <button type="button" onClick={onBuyAgain} disabled={busy} className="flex-1 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-low disabled:opacity-60">
            {busy ? 'Adding…' : 'Buy again'}
          </button>
        )}
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="reveal reveal-pop text-center py-12">
      <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon name="receipt_long" className="text-[44px] text-primary" />
      </div>
      <h2 className="mt-5 section-title">No orders yet</h2>
      <p className="mt-1.5 text-on-surface-variant text-sm">When you place an order, you can track it here.</p>
      <Link to="/home" className="btn-primary mt-6 inline-flex">Start shopping</Link>
    </div>
  );
}

function parseMeta(meta) {
  if (!meta) return null;
  if (typeof meta !== 'string') return meta;
  try { return JSON.parse(meta); } catch { return null; }
}
