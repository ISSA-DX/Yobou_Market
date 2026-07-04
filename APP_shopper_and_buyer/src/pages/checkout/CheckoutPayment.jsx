import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';

const SHIPPING_CENTS = 499;
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

export default function CheckoutPayment() {
  const navigate = useNavigate();
  const currency = useStore((s) => s.user?.currency || 'USD');
  const ensureGuestSession = useStore((s) => s.ensureGuestSession);
  const [method, setMethod] = useState('CARD');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data, error, loading, refetch } = useApi('/api/cart');

  // Cold-pasted /checkout/payment URLs must work for guests arising
  // straight from a deep link or share — without this the /api/cart
  // call below would 401 and render the RetryError card.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ensured = await ensureGuestSession();
      if (!cancelled) {
        const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
        if (!addressId) {
          navigate('/checkout/shipping', { replace: true });
          return;
        }
        if (ensured) await refetch();
      }
    })();
    return () => { cancelled = true; };
    // refetch + ensureGuestSession are stable from useStore; mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the items the shopper ticked on the Cart page flow into the
  // summary and the eventual order. The server enforces the same
  // filter on POST /api/orders, so showing the subset here keeps the
  // "what you'll pay" number honest.
  const allItems = Array.isArray(data?.items) ? data.items : [];
  const selectedItems = allItems.filter((i) => i?.product && i.selectedForCheckout);
  const subtotal = selectedItems.reduce((s, i) => s + i.product.priceCents * i.quantity, 0);
  const itemCount = selectedItems.reduce((s, i) => s + i.quantity, 0);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : (selectedItems.length > 0 ? SHIPPING_CENTS : 0);
  const total = subtotal + shipping;

  async function placeOrder(card) {
    setBusy(true); setErr('');
    try {
      const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
      if (!addressId) { navigate('/checkout/shipping'); return; }
      const body = { addressId, paymentMethod: method };
      if (method === 'CARD' && card) body.card = card;
      const { order, payment } = await api('/api/orders', { method: 'POST', body });
      if (!payment.ok) {
        setErr(payment.reason === 'DECLINED' ? 'Card was declined. Try another payment method.' : 'Payment failed.');
        return;
      }
      navigate(`/checkout/success/${order.id}`);
    } catch (e) {
      setErr(humanizeOrderError(e.data?.error));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <div className="p-8 text-center text-on-surface-variant">Loading…</div>;
  if (error && !data) return <RetryError message="Couldn't load your cart." onRetry={refetch} />;

  return (
    <div className="pt-4 space-y-5">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('/checkout/shipping')} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold text-lg">Checkout</h1>
        <span className="w-10" />
      </header>

      <div className="flex items-center gap-2 text-label-md">
        {['Shipping', 'Payment', 'Review'].map((step, i) => (
          <div key={step} className="flex-1 flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${i <= 1 ? 'bg-primary text-white' : 'bg-surface-high text-on-surface-variant'}`}>
              {i < 1 ? <Icon name="check" className="text-[14px]" /> : i + 1}
            </div>
            <span className={i === 1 ? 'text-primary font-semibold' : 'text-on-surface-variant'}>{step}</span>
            {i < 2 && <div className="flex-1 h-px bg-outline-variant/40" />}
          </div>
        ))}
      </div>

      {/* Headline summary of what's about to be ordered. Amazon-style
          preview: thumbnail, qty, name, line total — so the user sees
          exactly what's heading into the charge before tapping Place
          Order. */}
      {selectedItems.length > 0 && (
        <details className="card p-3 group" open>
          <summary className="flex items-center gap-2 cursor-pointer list-none">
            <Icon name="shopping_bag" className="text-primary text-[20px]" />
            <span className="font-semibold text-sm">
              {itemCount} {itemCount === 1 ? 'item' : 'items'} in this order
            </span>
            <span className="ml-auto group-open:rotate-180 transition-transform">
              <Icon name="expand_more" className="text-[18px] text-on-surface-variant" />
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {selectedItems.slice(0, 5).map((it) => (
              <div key={it.id} className="flex items-center gap-2 min-w-0">
                <img
                  src={productImage(it.product)}
                  alt={it.product.name}
                  loading="lazy"
                  className="w-10 h-10 rounded object-cover bg-surface-low"
                  onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium line-clamp-1">{it.product.name}</div>
                  <div className="text-label-md text-on-surface-variant">Qty {it.quantity}</div>
                </div>
                <div className="text-sm font-semibold shrink-0">
                  {formatPrice(it.product.priceCents * it.quantity, currency)}
                </div>
              </div>
            ))}
            {selectedItems.length > 5 && (
              <div className="text-label-md text-on-surface-variant text-center pt-1">
                +{selectedItems.length - 5} more
              </div>
            )}
          </div>
          {allItems.length - selectedItems.length > 0 && (
            <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center gap-2 text-label-md text-on-surface-variant">
              <Icon name="bookmark" className="text-[16px]" />
              <span>
                {allItems.length - selectedItems.length} more {allItems.length - selectedItems.length === 1 ? 'item is' : 'items are'} saved for later in your cart.
              </span>
            </div>
          )}
        </details>
      )}

      <h2 className="text-headline-md font-bold">Payment method</h2>
      <PaymentMethodPicker value={method} onChange={setMethod} />

      {/* Express wallets */}
      <div className="space-y-2">
        <div className="text-label-md text-on-surface-variant">Express wallets</div>
        <button onClick={() => setMethod('PAYPAL')} className="w-full card p-3 flex items-center gap-3 hover:border-primary/40">
          <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-black">P</div>
          <span className="font-semibold flex-1 text-left">PayPal</span>
          {method === 'PAYPAL' && <Icon name="check_circle" className="text-tertiary" />}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMethod('CARD')}
            disabled
            className="card p-3 flex items-center gap-2 hover:border-primary/40 disabled:opacity-50"
          >
            <Icon name="phone_iphone" /> <span className="font-semibold text-sm">Apple Pay</span>
          </button>
          <button
            onClick={() => setMethod('CARD')}
            disabled
            className="card p-3 flex items-center gap-2 hover:border-primary/40 disabled:opacity-50"
          >
            <Icon name="account_circle" /> <span className="font-semibold text-sm">Google Pay</span>
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <Row label={`Subtotal (${itemCount} items)`} value={formatPrice(subtotal, currency)} />
        <Row label="Shipping" value={shipping === 0 ? 'FREE' : formatPrice(shipping, currency)} />
        <div className="border-t border-outline-variant/30 pt-2 mt-2">
          <Row label="Total" value={formatPrice(total, currency)} bold />
        </div>
      </div>

      {err && <div className="text-error text-sm">{err}</div>}

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t border-outline-variant/30">
        <button
          onClick={() => method === 'CARD' ? navigate('/checkout/card/new') : placeOrder()}
          disabled={busy || selectedItems.length === 0}
          className="btn-primary w-full py-3 max-w-screen-md mx-auto disabled:opacity-60"
        >
          {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
          {method === 'CARD' ? 'Enter card details' : `Place order · ${formatPrice(total, currency)}`}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold text-headline-md' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function humanizeOrderError(code) {
  switch (code) {
    case 'CART_EMPTY': return 'Your cart is empty.';
    case 'ADDRESS_INVALID': return 'Please select a shipping address.';
    case 'INSUFFICIENT_STOCK': return 'An item in your cart is out of stock.';
    case 'NO_SELECTION': return 'Please go back to your cart and select at least one item.';
    case 'PRODUCT_NOT_AVAILABLE': return 'A product in your cart is no longer available.';
    default: return 'Could not place order. Please try again.';
  }
}
