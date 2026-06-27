import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import PaymentMethodPicker from '../../components/PaymentMethodPicker';
import { useApi, RetryError } from '../../useApi.jsx';
import { useStore } from '../../store';
import { formatPrice } from '../../lib/format';

const SHIPPING_CENTS = 499;
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

export default function CheckoutPayment() {
  const navigate = useNavigate();
  const currency = useStore((s) => s.user?.currency || 'USD');
  const [method, setMethod] = useState('CARD');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data, error, loading, refetch } = useApi('/api/cart');

  useEffect(() => {
    const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
    if (!addressId) navigate('/checkout/shipping', { replace: true });
  }, [navigate]);

  const items = data?.items || [];
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = data?.subtotalCents || 0;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS;
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

  if (loading) return <div className="p-8 text-center text-on-surface-variant">Loading…</div>;
  if (error && !data) return <RetryError message="Couldn't load your cart." onRetry={refetch} />;

  return (
    <div className="pt-4 space-y-5">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
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

      <h2 className="text-headline-md font-bold">Payment method</h2>
      <PaymentMethodPicker value={method} onChange={setMethod} />

      {/* Express wallets */}
      <div className="space-y-2">
        <div className="text-label-md text-on-surface-variant">Express wallets</div>
        <button onClick={() => setMethod('PAYPAL')} className="w-full card p-3 flex items-center gap-3 hover:border-primary/40">
          <div className="w-10 h-10 rounded-lg bg-[#003087] text-white flex items-center justify-center font-black">P</div>
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
          disabled={busy || items.length === 0}
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
    case 'PRODUCT_NOT_AVAILABLE': return 'A product in your cart is no longer available.';
    default: return 'Could not place order. Please try again.';
  }
}
