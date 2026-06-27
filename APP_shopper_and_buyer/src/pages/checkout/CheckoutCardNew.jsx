import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import CardForm from '../../components/CardForm';

export default function CheckoutCardNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('return') || '/checkout/payment';
  const [err, setErr] = useState('');

  useEffect(() => {
    const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
    if (!addressId) navigate('/checkout/shipping', { replace: true });
  }, [navigate]);

  async function handleCard(card) {
    setErr('');
    try {
      const addressId = sessionStorage.getItem('yobou:checkoutAddressId');
      if (!addressId) {
        navigate('/checkout/shipping');
        return;
      }
      const { order, payment } = await api('/api/orders', {
        method: 'POST',
        body: { addressId, paymentMethod: 'CARD', card },
      });
      if (!payment.ok) {
        setErr(payment.reason === 'DECLINED' ? 'Card declined. Try again.' : 'Payment failed.');
        return;
      }
      navigate(`/checkout/success/${order.id}`);
    } catch (e) {
      setErr(humanizeError(e.data?.error));
    }
  }

  return (
    <div className="pt-4 space-y-5">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(returnTo)} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold text-lg">Secure checkout</h1>
        <span className="w-10" />
      </header>

      <div className="card p-4 bg-gradient-to-r from-primary/5 to-primary-container/5 flex items-center gap-3">
        <Icon name="lock" className="text-primary" />
        <p className="text-sm text-on-surface-variant">Your card details are encrypted and never stored on our servers.</p>
      </div>

      {err && <div className="text-error text-sm">{err}</div>}

      <CardForm onSubmit={handleCard} submitLabel="Pay securely" />

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
    case 'INVALID_INPUT': return 'Please check your card details.';
    default: return 'Could not place order.';
  }
}
