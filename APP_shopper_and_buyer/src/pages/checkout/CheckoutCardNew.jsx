import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import CardForm from '../../components/CardForm';

// Promo code remembered by CheckoutPayment (same key).
const PROMO_KEY = 'yobou:checkoutCoupon';

export default function CheckoutCardNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('return') || '/checkout/payment';
  const ensureGuestSession = useStore((s) => s.ensureGuestSession);
  const [err, setErr] = useState('');

  // Cold-pasted /checkout/card/new URLs must work for guests who
  // never explicitly added to cart — without this mount-bootstrap,
  // /api/orders would 401 and the form would fail before submission.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureGuestSession();
      const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
      if (!cancelled && !addressId) navigate('/checkout/shipping', { replace: true });
    })();
    return () => { cancelled = true; };
    // ensureGuestSession is stable from useStore; mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCard(card) {
    setErr('');
    try {
      const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
      if (!addressId) {
        navigate('/checkout/shipping');
        return;
      }
      // Promo code chosen on the payment step (validated again server-side).
      const couponCode = sessionStorage.getItem(PROMO_KEY) || undefined;
      const { order, payment } = await api('/api/orders', {
        method: 'POST',
        body: { addressId, paymentMethod: 'CARD', card, couponCode },
      });
      if (!payment.ok) {
        setErr(payment.reason === 'DECLINED' ? 'Card declined. Try again.' : 'Payment failed.');
        return;
      }
      sessionStorage.removeItem(PROMO_KEY);
      navigate(`/checkout/success/${order.id}`);
    } catch (e) {
      setErr(humanizeError(e.data?.error));
    }
  }

  return (
    <div className="pt-4 space-y-5">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => navigate(returnTo)} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold text-lg">Secure checkout</h1>
        <span className="w-10" />
      </header>

      <div className="reveal reveal-zoom card p-4 bg-gradient-to-r from-primary/5 to-primary-container/5 flex items-center gap-3">
        <Icon name="lock" className="text-primary" />
        <p className="text-sm text-on-surface-variant">Your card details are encrypted and never stored on our servers.</p>
      </div>

      {err && <div className="text-error text-sm">{err}</div>}

      <div className="reveal reveal-fade-up" style={{ "--reveal-delay": "120ms" }}><CardForm onSubmit={handleCard} submitLabel="Pay securely" /></div>

      <div className="text-center text-label-md text-on-surface-variant flex items-center justify-center gap-3">
        <Icon name="verified" className="text-[16px]" /> 256-bit SSL · PCI-DSS Level 1
      </div>
    </div>
  );
}

function humanizeError(code) {
  switch (code) {
    case 'ADDRESS_INVALID': return 'Please select a shipping address.';
    case 'CART_EMPTY': return 'Your cart is empty.';
    case 'INSUFFICIENT_STOCK': return 'An item is out of stock.';
    case 'NO_SELECTION': return 'Please select at least one item on the Cart page.';
    case 'INVALID_INPUT': return 'Please check your card details.';
    case 'COUPON_USED_UP':
    case 'COUPON_EXPIRED':
    case 'COUPON_INACTIVE':
    case 'COUPON_ALREADY_USED':
    case 'COUPON_MIN_SUBTOTAL':
      return 'Your promo code can no longer be applied. Go back and remove it.';
    default: return 'Could not place order.';
  }
}
