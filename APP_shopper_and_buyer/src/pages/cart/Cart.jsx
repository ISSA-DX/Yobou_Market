import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';
import { toast } from '../../lib/toast';

const SHIPPING_CENTS = 499;
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

export default function Cart() {
  const navigate = useNavigate();
  const refreshCart = useStore((s) => s.refreshCartCount);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const { data, error, loading, refetch, setData } = useApi('/api/cart');

  // Compute totals from valid items only so a missing product never inflates the bill.
  const items = Array.isArray(data?.items) ? data.items : [];
  const validItems = items.filter((i) => i?.product);
  const subtotal = validItems.reduce((s, i) => s + i.product.priceCents * i.quantity, 0);
  const itemCount = validItems.reduce((s, i) => s + i.quantity, 0);

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : validItems.length > 0 ? SHIPPING_CENTS : 0;
  const tax = 0;
  const total = subtotal + shipping + tax;

  useEffect(() => { if (data) refreshCart(); }, [data, refreshCart]);

  async function setQty(productId, qty) {
    if (qty < 0) return;
    setActionError('');
    if (qty === 0) {
      await remove(productId);
      return;
    }
    setBusyId(productId);
    try {
      await api(`/api/cart/${productId}`, { method: 'PATCH', body: { quantity: qty } });
      await refetch();
    } catch (e) {
      const msg = humanizeError(e);
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(productId) {
    setBusyId(productId);
    setActionError('');
    try {
      await api(`/api/cart/${productId}`, { method: 'DELETE' });
      await refetch();
      toast.success('Removed from cart');
    } catch (e) {
      const msg = humanizeError(e);
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <Icon name="progress_activity" className="text-[32px] animate-spin" />
        <div className="mt-3 text-sm">Loading your cart…</div>
      </div>
    );
  }

  if (error && !data) {
    return <RetryError message="Couldn't load your cart." onRetry={refetch} />;
  }

  if (validItems.length === 0) {
    return (
      <div className="px-4 pt-6 pb-6 text-center max-w-screen-xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/home" className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></Link>
          <h1 className="font-bold text-lg">Shopping Cart</h1>
          <span className="w-10" />
        </header>
        <div className="py-16">
          <div className="mx-auto w-24 h-24 rounded-full bg-surface-low flex items-center justify-center">
            <Icon name="shopping_bag" className="text-[44px] text-on-surface-variant" />
          </div>
          <h2 className="mt-5 text-headline-md font-bold">Your cart is empty</h2>
          <p className="mt-2 text-on-surface-variant text-sm max-w-xs mx-auto">Browse products and add your favorites to start shopping.</p>
          <Link to="/home" className="btn-primary mt-6 inline-flex">Start shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-screen-xl mx-auto">
      <header className="flex items-center justify-between mb-4 md:hidden">
        <Link to="/home" className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></Link>
        <h1 className="font-bold text-lg">Shopping Cart</h1>
        <span className="w-10" />
      </header>

      <div className="hidden md:flex items-end justify-between mb-6">
        <div>
          <h1 className="text-headline-lg font-bold">Shopping Cart</h1>
          <p className="text-on-surface-variant mt-1">{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
        </div>
        <Link to="/home" className="text-primary font-semibold flex items-center gap-1">
          <Icon name="arrow_back" className="text-[18px]" /> Continue shopping
        </Link>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-error-container text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[18px] shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
        {/* Items column */}
        <div className="lg:col-span-8 space-y-4">
          {/* Free-shipping progress */}
          {subtotal < FREE_SHIPPING_THRESHOLD_CENTS && (
            <div className="card p-4 bg-gradient-to-r from-primary to-primary-container text-white">
              <div className="flex items-center justify-between text-label-md">
                <span>Free shipping on orders over {formatPrice(FREE_SHIPPING_THRESHOLD_CENTS, currency)}</span>
                <span>{formatPrice(subtotal, currency)} / {formatPrice(FREE_SHIPPING_THRESHOLD_CENTS, currency)}</span>
              </div>
              <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-secondary transition-all" style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD_CENTS) * 100)}%` }} />
              </div>
              <div className="mt-2 text-label-md">
                Add {formatPrice(FREE_SHIPPING_THRESHOLD_CENTS - subtotal, currency)} more for free shipping.
              </div>
            </div>
          )}

          {validItems.map((it) => (
            <CartItem
              key={it.id}
              item={it}
              busy={busyId === it.product.id}
              currency={currency}
              onQtyChange={(qty) => setQty(it.product.id, qty)}
              onRemove={() => remove(it.product.id)}
            />
          ))}

          {items.length > validItems.length && (
            <p className="text-sm text-on-surface-variant">
              {items.length - validItems.length} unavailable item(s) were removed from your total.
            </p>
          )}
        </div>

        {/* Summary column */}
        <div className="lg:col-span-4 mt-6 lg:mt-0">
          <div className="card p-5 lg:sticky lg:top-4 space-y-3">
            <h2 className="text-headline-md font-bold hidden lg:block">Order Summary</h2>
            <SummaryRow label={`Subtotal (${itemCount} items)`} value={formatPrice(subtotal, currency)} />
            <SummaryRow
              label="Shipping"
              value={shipping === 0 ? 'FREE' : formatPrice(shipping, currency)}
              valueClass={shipping === 0 ? 'text-tertiary font-semibold' : ''}
            />
            <SummaryRow label="Tax" value="Calculated at checkout" muted />
            <div className="border-t border-outline-variant/30 pt-3 mt-1">
              <SummaryRow label="Estimated total" value={formatPrice(total, currency)} bold />
            </div>

            <button
              onClick={() => navigate('/checkout/shipping')}
              className="btn-primary w-full py-3 mt-2"
            >
              Proceed to Checkout
              <Icon name="arrow_forward" />
            </button>

            <p className="text-center text-label-md text-on-surface-variant flex items-center justify-center gap-1">
              <Icon name="lock" className="text-[14px]" /> Secure checkout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartItem({ item, busy, currency, onQtyChange, onRemove }) {
  const p = item.product;
  const [showQty, setShowQty] = useState(false);
  const lineTotal = p.priceCents * item.quantity;

  return (
    <div className="card p-3 sm:p-4 flex gap-3 sm:gap-4">
      <Link to={`/product/${p.id}`} className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-surface-low shrink-0">
        <img src={productImage(p)} alt={p.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }} />
      </Link>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/product/${p.id}`} className="block group">
            <h3 className="font-semibold text-sm sm:text-base text-on-surface line-clamp-2 leading-snug group-hover:text-primary transition-colors">
              {p.name}
            </h3>
          </Link>
          <button
            onClick={onRemove}
            disabled={busy}
            className="text-on-surface-variant hover:text-error p-1 disabled:opacity-50 shrink-0"
            aria-label="Remove item"
          >
            <Icon name="delete" className="text-[20px]" />
          </button>
        </div>

        <div className="text-label-md text-on-surface-variant mt-0.5">{p.category}</div>

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Mobile +/- */}
            <div className="flex items-center bg-surface-low rounded-full px-1.5 py-1 sm:hidden">
              <button
                onClick={() => onQtyChange(item.quantity - 1)}
                disabled={busy}
                className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center disabled:opacity-50"
              >
                <Icon name="remove" className="text-[16px]" />
              </button>
              <span className="font-semibold text-sm w-8 text-center">{item.quantity}</span>
              <button
                onClick={() => onQtyChange(item.quantity + 1)}
                disabled={busy || item.quantity >= p.stock}
                className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center disabled:opacity-50"
              >
                <Icon name="add" className="text-[16px]" />
              </button>
            </div>

            {/* Desktop dropdown */}
            <div className="hidden sm:block relative">
              <button
                onClick={() => setShowQty((v) => !v)}
                className="flex items-center gap-2 bg-surface-low hover:bg-surface-high border border-outline-variant/30 rounded-md px-3 py-1.5 text-sm font-medium transition"
              >
                Qty: {item.quantity}
                <Icon name="expand_more" className="text-[16px]" />
              </button>
              {showQty && (
                <div className="absolute z-20 mt-1 bg-white border border-outline-variant/30 rounded-md shadow-float w-24 max-h-48 overflow-y-auto">
                  {[...Array(10)].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => { onQtyChange(i + 1); setShowQty(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-low ${item.quantity === i + 1 ? 'bg-surface-low font-semibold' : ''}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin text-primary" />}
          </div>

          <div className="text-right">
            <div className="font-bold text-on-surface text-sm sm:text-base">{formatPrice(lineTotal, currency)}</div>
            {item.quantity > 1 && (
              <div className="text-label-md text-on-surface-variant">{formatPrice(p.priceCents, currency)} each</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, bold, muted, valueClass = '' }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-on-surface-variant' : 'text-on-surface'}`}>
      <span className={bold ? 'font-bold text-base' : 'text-sm'}>{label}</span>
      <span className={`${bold ? 'font-bold text-headline-md' : 'text-sm'} ${valueClass}`}>{value}</span>
    </div>
  );
}

function humanizeError(e) {
  const code = e?.data?.error || e?.message;
  if (code === 'INSUFFICIENT_STOCK') return 'Not enough stock for this item.';
  if (code === 'UNAUTHENTICATED' || e?.status === 401) return 'Please sign in again.';
  if (code === 'CART_EMPTY') return 'Your cart is empty.';
  return code || 'Something went wrong. Please try again.';
}
