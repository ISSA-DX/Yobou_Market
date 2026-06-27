import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice, userLocale } from '../../lib/format';
import { useStore } from '../../store';

const STATUS_TONE = {
  PLACED: 'chip bg-surface-high text-on-surface',
  PAID: 'chip bg-tertiary-container/20 text-tertiary border-0',
  PROCESSING: 'chip bg-primary/10 text-primary border-0',
  SHIPPED: 'chip bg-secondary/20 text-on-secondary border-0',
  DELIVERED: 'chip bg-tertiary text-white border-0',
  CANCELLED: 'chip bg-error text-white border-0',
  REFUNDED: 'chip bg-error text-white border-0',
};

const REFUND_TONE = {
  PENDING: 'chip bg-secondary/20 text-on-secondary border-0',
  PROCESSED: 'chip bg-tertiary text-white border-0',
  APPROVED: 'chip bg-tertiary-container/20 text-tertiary border-0',
  REJECTED: 'chip bg-error/10 text-error border-0',
};

export default function Orders() {
  const currency = useStore((s) => s.user?.currency || 'USD');
  const language = useStore((s) => s.user?.language || 'en');
  const { data, error, loading, refetch } = useApi('/api/orders');
  const orders = data?.orders || [];

  if (error && !data) {
    return <RetryError message="Couldn't load your orders." onRetry={refetch} />;
  }
  if (loading && !data) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <Icon name="progress_activity" className="text-[32px] animate-spin" />
        <div className="mt-3 text-sm">Loading your orders…</div>
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="px-4 pt-6 pb-6">
        <h1 className="text-headline-lg font-bold mb-6">My Orders</h1>
        <div className="text-center py-12">
          <Icon name="receipt_long" className="text-[56px] text-on-surface-variant" />
          <h2 className="mt-4 font-bold">No orders yet</h2>
          <p className="mt-2 text-on-surface-variant text-sm">When you place an order it will appear here.</p>
          <Link to="/home" className="btn-primary mt-6 inline-flex">Start shopping</Link>
        </div>
      </div>
    );
  }

  const locale = userLocale(language);

  return (
    <div className="px-4 pt-4 pb-6 space-y-3">
      <h1 className="text-headline-lg font-bold mb-2">My Orders</h1>
      {orders.map((o) => {
        if (!o?.id) return null;
        const itemCount = (o.items || []).length;
        const first = (o.items || []).find((it) => it?.product)?.product;
        return (
          <Link key={o.id} to={`/orders/${o.id}/track`} className="card p-4 flex items-center gap-3 hover:shadow-float">
            <img
              src={productImage(first)}
              alt=""
              className="w-16 h-16 rounded-md object-cover bg-surface-low"
              onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">#{o.id.slice(-8).toUpperCase()}</div>
              <div className="text-label-md text-on-surface-variant">
                {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatPrice(o.totalCents, currency, language)}
              </div>
              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                <span className={STATUS_TONE[o.status] || 'chip'}>{o.status}</span>
                {o.refunds?.[0] && (
                  <span className={REFUND_TONE[o.refunds[0].status] || 'chip'}>
                    Refund: {o.refunds[0].status}
                  </span>
                )}
                <span className="text-label-md text-on-surface-variant">
                  {o.createdAt ? new Date(o.createdAt).toLocaleDateString(locale, { dateStyle: 'medium' }) : ''}
                </span>
              </div>
            </div>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </Link>
        );
      })}
    </div>
  );
}
