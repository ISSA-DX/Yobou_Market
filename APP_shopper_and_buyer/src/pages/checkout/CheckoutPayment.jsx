import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';
import MobileMoneyForm from '../../components/MobileMoneyForm';

const SHIPPING_CENTS = 499;
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;
// Same key is read by CheckoutCardNew, which places card orders.
const PROMO_KEY = 'yobou:checkoutCoupon';

function humanizePromoError(data, currency) {
  switch (data?.error) {
    case 'COUPON_NOT_FOUND': return "That code doesn't exist.";
    case 'COUPON_INACTIVE': return 'This code is no longer active.';
    case 'COUPON_NOT_STARTED': return "This code isn't valid yet.";
    case 'COUPON_EXPIRED': return 'This code has expired.';
    case 'COUPON_USED_UP': return 'This code has reached its usage limit.';
    case 'COUPON_ALREADY_USED': return "You've already used this code.";
    case 'COUPON_MIN_SUBTOTAL': return `Spend at least ${formatPrice(data.minSubtotalCents, currency)} to use this code.`;
    case 'RATE_LIMITED': return 'Too many attempts — try again in a few minutes.';
    default: return 'Could not apply this code.';
  }
}

export default function CheckoutPayment() {
  const navigate = useNavigate();
  const currency = useStore((s) => s.user?.currency || 'USD');
  const ensureGuestSession = useStore((s) => s.ensureGuestSession);
  const [method, setMethod] = useState('CARD');
  const [mobileMoney, setMobileMoney] = useState({ provider: 'MPESA', phone: '', country: 'KE' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Promo code: validated by the server against the selected cart.
  const [promo, setPromo] = useState(null); // { code, description, discountCents }
  const [promoInput, setPromoInput] = useState('');
  const [promoErr, setPromoErr] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  // Fetch /api/cart on mount. api.js handles the 401 → refresh round-
  // trip on its own (server/src/auth/routes.js now sets the refresh
  // cookie SameSite=None; Secure in production so the cross-site
  // round-trip survives the Capacitor WebView). Deliberately NOT
  // gating on `hasUser`: a parallel skip-gate races boot()'s refresh
  // promise and can clobber a returning customer's refresh cookie.
  const { data, error, loading, refetch } = useApi('/api/cart');

  // Cold-pasted /checkout/payment URLs must work for guests arising
  // straight from a deep link or share — without this guard the user
  // would land on Payment without an addressId in sessionStorage and
  // get bounced back to Shipping at submit-time. Booting a guest
  // session here is idempotent (no-op when zustand already has a
  // user) and runs AFTER mount so it never races boot()'s refresh.
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
  const discount = promo && selectedItems.length > 0 ? Math.min(promo.discountCents, subtotal) : 0;
  const total = subtotal - discount + shipping;

  // Re-check a remembered promo when the cart total changes (min-subtotal
  // rules, percentage amount).
  useEffect(() => {
    const saved = sessionStorage.getItem(PROMO_KEY);
    if (!saved || !data) return;
    applyPromo(saved, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, Boolean(data)]);

  async function applyPromo(code, { silent = false } = {}) {
    const clean = String(code || '').trim();
    if (!clean) return;
    setPromoBusy(true);
    if (!silent) setPromoErr('');
    try {
      const r = await api('/api/coupons/preview', { method: 'POST', body: { code: clean } });
      setPromo(r);
      setPromoInput('');
      setPromoErr('');
      sessionStorage.setItem(PROMO_KEY, r.code);
    } catch (e) {
      setPromo(null);
      sessionStorage.removeItem(PROMO_KEY);
      setPromoErr(humanizePromoError(e.data, currency));
    } finally {
      setPromoBusy(false);
    }
  }

  function removePromo() {
    setPromo(null);
    setPromoErr('');
    sessionStorage.removeItem(PROMO_KEY);
  }

  async function placeOrder(card) {
    setBusy(true); setErr('');
    try {
      const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
      if (!addressId) { navigate('/checkout/shipping'); return; }
      const body = { addressId, paymentMethod: method };
      if (method === 'CARD' && card) body.card = card;
      if (promo) body.couponCode = promo.code;
      if (method === 'MOBILE_MONEY') body.mobileMoney = mobileMoney;
      const { order, payment } = await api('/api/orders', { method: 'POST', body });
      if (!payment.ok) {
        setErr(payment.reason === 'DECLINED' ? 'Card was declined. Try another payment method.' : 'Payment failed.');
        return;
      }
      sessionStorage.removeItem(PROMO_KEY);
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
        <button type="button" onClick={() => navigate('/checkout/shipping')} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold text-lg">Checkout</h1>
        <span className="w-10" />
      </header>

      <div className="reveal reveal-wipe flex items-center gap-2 text-label-md">
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
        <details className="reveal reveal-fade-up card p-3 group" open>
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

      <h2 className="reveal reveal-slide-right text-headline-md font-bold">Payment method</h2>
      <div className="reveal reveal-pop"><PaymentMethodPicker value={method} onChange={setMethod} /></div>

      {method === 'MOBILE_MONEY' && (
        <MobileMoneyForm value={mobileMoney} onChange={setMobileMoney} />
      )}

      {/* Express wallets */}
      <div className="reveal-stagger stagger-up space-y-2">
        <div className="text-label-md text-on-surface-variant">Express wallets</div>
        <button type="button" onClick={() => setMethod('PAYPAL')} className="w-full card p-3 flex items-center gap-3 hover:border-primary/40">
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

      <div className="reveal reveal-flip card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="sell" className="text-primary text-[20px]" />
          <span className="font-semibold text-sm">Promo code</span>
        </div>
        {promo ? (
          <div className="flex items-center gap-2 rounded-lg bg-tertiary-container/20 px-3 py-2">
            <Icon name="check_circle" className="text-tertiary text-[20px]" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{promo.code}</div>
              {promo.description && <div className="text-label-md text-on-surface-variant line-clamp-1">{promo.description}</div>}
            </div>
            <span className="font-semibold text-tertiary text-sm">−{formatPrice(discount, currency)}</span>
            <button type="button" onClick={removePromo} className="p-1" aria-label="Remove promo code">
              <Icon name="close" className="text-[18px] text-on-surface-variant" />
            </button>
          </div>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => { e.preventDefault(); applyPromo(promoInput); }}
          >
            <input
              className="input flex-1 uppercase"
              placeholder="Enter code"
              autoCapitalize="characters"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value)}
              maxLength={40}
            />
            <button type="submit" disabled={promoBusy || !promoInput.trim()} className="btn-secondary px-4 disabled:opacity-60">
              Apply
            </button>
          </form>
        )}
        {promoErr && <div className="text-error text-label-md">{promoErr}</div>}
      </div>

      <div className="reveal reveal-tilt card p-4 space-y-2">
        <Row label={`Subtotal (${itemCount} items)`} value={formatPrice(subtotal, currency)} />
        {discount > 0 && <Row label={`Promo ${promo.code}`} value={`−${formatPrice(discount, currency)}`} />}
        <Row label="Shipping" value={shipping === 0 ? 'FREE' : formatPrice(shipping, currency)} />
        <div className="border-t border-outline-variant/30 pt-2 mt-2">
          <Row label="Total" value={formatPrice(total, currency)} bold />
        </div>
      </div>

      {err && <div className="text-error text-sm">{err}</div>}

      <div className="card p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Icon name="verified_user" className="text-[18px] text-primary" />
          <span>Secure, encrypted checkout</span>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Icon name="payments" className="text-[18px] text-primary" />
          <span>Pay on delivery & mobile money available</span>
        </div>
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Icon name="storefront" className="text-[18px] text-primary" />
          <span>Pickup point delivery available in major cities</span>
        </div>
      </div>

      {/* Same centred column as the page (TransactionLayout main), so the
          bar lines up with the cards on tablets and the web build. */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-outline-variant/30" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-screen-md mx-auto p-4">
          <button
            onClick={() => method === 'CARD' ? navigate('/checkout/card/new') : placeOrder()}
            disabled={busy || selectedItems.length === 0 || (method === 'MOBILE_MONEY' && !isMobileMoneyValid(mobileMoney))}
            className="btn-primary w-full py-3 whitespace-normal text-center leading-tight disabled:opacity-60"
          >
            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            <span>{method === 'CARD' ? 'Enter card details' : 'Place order'}</span>
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">{formatPrice(total, currency)}</span>
          </button>
        </div>
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
    case 'COUPON_USED_UP':
    case 'COUPON_EXPIRED':
    case 'COUPON_INACTIVE':
    case 'COUPON_ALREADY_USED':
    case 'COUPON_MIN_SUBTOTAL':
      return 'Your promo code can no longer be applied. Remove it and try again.';
    default: return 'Could not place order. Please try again.';
  }
}

function isMobileMoneyValid(mm) {
  return mm && mm.provider && mm.country?.length === 2 && mm.phone?.replace(/\D/g, '').length >= 8;
}
