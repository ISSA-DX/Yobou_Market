import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';
import { useStore } from '../../store';

const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'REFUNDED']);
const STATUS_LABEL = {
  PLACED: 'Order placed',
  PAID: 'Payment confirmed',
  PROCESSING: 'Preparing your order',
  SHIPPED: 'On the way',
};

const STATUS_ICON = {
  PLACED: 'receipt_long',
  PAID: 'payments',
  PROCESSING: 'inventory_2',
  SHIPPED: 'local_shipping',
};

/**
 * Small card that surfaces the user's most recent active order so they can
 * jump back to tracking without opening the Orders tab.
 */
export default function OrderPeek({ orders = [], loading }) {
  const currency = useStore((s) => s.user?.currency || 'USD');

  if (loading) {
    return (
      <div className="card p-3 flex items-center gap-3 animate-pulse">
        <div className="w-12 h-12 rounded-md bg-surface-low shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-surface-low rounded w-1/3" />
          <div className="h-3 bg-surface-low rounded w-1/2" />
        </div>
      </div>
    );
  }

  const order = orders.find((o) => o?.id && !TERMINAL_STATUSES.has(o.status));
  if (!order) return null;

  const first = order.items?.find((it) => it?.product)?.product;
  const itemCount = order.items?.length || 0;

  return (
    <Link
      to={`/orders/${order.id}/track`}
      className="card p-3 flex items-center gap-3 bg-primary/5 border border-primary/20 hover:bg-primary/10 transition"
    >
      {first ? (
        <img
          src={productImage(first)}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-12 h-12 rounded-md object-cover bg-surface-low shrink-0"
          onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
        />
      ) : (
        <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Icon name={STATUS_ICON[order.status] || 'local_shipping'} className="text-primary text-[22px]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-label-md text-tertiary font-semibold">
          {STATUS_LABEL[order.status] || order.status}
        </div>
        <div className="text-sm text-on-surface truncate">
          {itemCount} item{itemCount !== 1 ? 's' : ''} · {formatPrice(order.totalCents, currency)}
        </div>
        <div className="text-label-md text-on-surface-variant mt-0.5">
          Tap to track your order
        </div>
      </div>
      <Icon name="chevron_right" className="text-on-surface-variant shrink-0" />
    </Link>
  );
}
