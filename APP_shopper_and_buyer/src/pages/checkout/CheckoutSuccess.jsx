import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';

export default function CheckoutSuccess() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const refreshCart = useStore((s) => s.refreshCartCount);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const { data, error, loading, refetch } = useApi(`/api/orders/${orderId}`);
  const { data: recData } = useApi('/api/products?limit=6');
  const order = data?.order;
  const recommended = (recData?.products || []).slice(0, 6);

  useEffect(() => { refreshCart(); }, [refreshCart]);

  if (error && !data) {
    return <RetryError message="Couldn't load your order." onRetry={refetch} />;
  }
  if (!order) return <div className="p-8 text-center text-on-surface-variant">Loading your order…</div>;

  return (
    <div className="pt-6 text-center">
      <header className="flex items-center justify-between mb-8">
        <button onClick={() => navigate('/home')} className="p-2 -ml-2"><Icon name="close" className="text-[24px]" /></button>
        <div className="w-9 h-9 rounded-md bg-primary text-white flex items-center justify-center font-black">Y</div>
        <span className="w-10" />
      </header>

      {/* Animated check */}
      <div className="relative mx-auto w-32 h-32">
        <div className="absolute inset-0 rounded-full bg-tertiary-container/20 animate-ping" />
        <div className="absolute inset-2 rounded-full bg-tertiary-container/30 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-tertiary flex items-center justify-center shadow-float">
            <Icon name="check" className="text-white text-[44px]" fill />
          </div>
        </div>
      </div>

      <h1 className="mt-8 text-headline-lg font-bold">Thank you!</h1>
      <p className="mt-2 text-on-surface-variant">Your order has been placed successfully.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 text-left">
        <div className="card p-4">
          <div className="text-label-md text-on-surface-variant">Order ID</div>
          <div className="font-bold mt-1">#{(order.id || '').slice(-8).toUpperCase()}</div>
        </div>
        <div className="card p-4">
          <div className="text-label-md text-on-surface-variant">Estimated delivery</div>
          <div className="font-bold mt-1">{new Date(Date.now() + 3 * 86400000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>
      </div>

      <div className="mt-4 card p-4 text-left">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-label-md text-on-surface-variant">Total paid</div>
            <div className="text-headline-md font-bold">{formatPrice(order.totalCents, currency)}</div>
          </div>
          <div className="chip bg-tertiary-container/20 text-tertiary border-0">
            <Icon name="verified" className="text-[14px]" /> Confirmed
          </div>
        </div>
        {order.address?.recipientName && (
          <div className="mt-3 pt-3 border-t border-outline-variant/20">
            <div className="text-label-md text-on-surface-variant">Shipping to</div>
            <div className="font-semibold text-sm mt-0.5">{order.address.recipientName}</div>
            <div className="text-label-md text-on-surface-variant">{order.address.line1}, {order.address.city}</div>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        <Link to={`/orders/${order.id}/track`} className="btn-primary w-full py-3">
          <Icon name="local_shipping" /> Track Order
        </Link>
        <Link to="/home" className="btn-secondary w-full py-3">Continue Shopping</Link>
      </div>

      {recommended.length > 0 && (
        <div className="mt-10 text-left">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Icon name="recommend" className="text-[20px] text-primary" />
            You might also like
          </h3>
          <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
            {recommended.map((p) => (
              <RecommendedCard key={p.id} product={p} currency={currency} refreshCart={refreshCart} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendedCard({ product, currency, refreshCart }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const outOfStock = product.stock === 0;
  const rating = 4.0;

  async function addToCart(e) {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock || adding) return;
    if (added) {
      navigate('/cart');
      return;
    }
    setAdding(true);
    try {
      await api('/api/cart', {
        method: 'POST',
        body: { productId: product.id, quantity: 1 },
      });
      await refreshCart();
      setAdded(true);
      setTimeout(() => setAdded(false), 3000);
    } catch {
      // silently fail; user can retry from product page
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="min-w-[168px] sm:min-w-[188px] card p-2.5 flex flex-col overflow-hidden hover:shadow-float transition">
      <Link to={`/product/${product.id}`} className="block">
        <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-low">
          <img
            src={productImage(product)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="mt-2.5 px-0.5 text-left">
          <div className="text-sm font-semibold text-on-surface line-clamp-2 leading-snug min-h-[2.5rem]">
            {product.name}
          </div>
          <div className="mt-1 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <Icon
                key={s}
                name="star"
                className={`text-[14px] ${s <= Math.round(rating) ? 'text-secondary' : 'text-surface-high'}`}
                fill={s <= Math.round(rating)}
              />
            ))}
            <span className="text-label-md text-on-surface-variant">(12)</span>
          </div>
          <div className="mt-1 text-label-md text-primary font-bold">{formatPrice(product.priceCents, currency)}</div>
        </div>
      </Link>

      <button
        onClick={addToCart}
        disabled={adding || outOfStock}
        className={`mt-auto w-full py-2 px-3 rounded-full text-xs font-semibold border-2 transition flex items-center justify-center ${
          added
            ? 'bg-green-50 border-green-500 text-green-700 hover:bg-green-100'
            : outOfStock
            ? 'bg-surface-low border-outline-variant/40 text-on-surface-variant cursor-not-allowed'
            : 'bg-white border-primary text-primary hover:bg-primary hover:text-white active:scale-[0.98]'
        }`}
      >
        {adding ? (
          <span className="inline-flex items-center gap-1.5 -ml-3">
            <Icon name="progress_activity" className="text-[16px] animate-spin" />
            Adding…
          </span>
        ) : added ? (
          <span className="inline-flex items-center gap-1.5 -ml-3">
            <Icon name="shopping_cart" className="text-[16px]" />
            Go to Cart
          </span>
        ) : outOfStock ? (
          'Out of stock'
        ) : (
          <span className="inline-flex items-center gap-1.5 -ml-3">
            <Icon name="add_shopping_cart" className="text-[16px]" />
            Add to Cart
          </span>
        )}
      </button>
    </div>
  );
}
