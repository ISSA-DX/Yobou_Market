import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';

export default function CheckoutShipping() {
  const navigate = useNavigate();
  const ensureGuestSession = useStore((s) => s.ensureGuestSession);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const { data, error, refetch } = useApi('/api/addresses');
  const { data: cartData } = useApi('/api/cart');
  const addresses = data?.addresses || [];
  const [form, setForm] = useState({
    recipientName: '', street: '', city: '', state: '', postal: '', isDefault: true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Cold-pasted checkout URLs must work for guests who haven't added
  // anything to the cart yet — without this mount-bootstrap, /api/cart
  // would 401 and the page would render RetryError instead of the form.
  // ensureGuestSession is idempotent — if zustand already has a user
  // (real customer or returning guest w/ refresh cookie) it's a no-op.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ensured = await ensureGuestSession();
      if (!cancelled && ensured) await refetch();
    })();
    return () => { cancelled = true; };
    // refetch + ensureGuestSession are stable from useStore; mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill from default address once it loads
  useEffect(() => {
    if (!addresses.length) return;
    const def = addresses.find((a) => a.isDefault) || addresses[0];
    setForm((f) => ({
      recipientName: f.recipientName || def.recipientName || '',
      street: f.street || def.line1,
      city: f.city || def.city,
      state: f.state || def.state,
      postal: f.postal || def.postal,
      isDefault: f.isDefault,
    }));
  }, [addresses.length]);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const body = {
        recipientName: form.recipientName,
        line1: form.street,
        city: form.city,
        state: form.state,
        postal: form.postal,
        isDefault: form.isDefault,
      };
      const { address } = await api('/api/addresses', { method: 'POST', body });
      sessionStorage.setItem('yobou:checkoutAddressId', address.id);
      navigate('/checkout/payment');
    } catch (e) {
      setErr('Could not save address. Check your details.');
    } finally {
      setBusy(false);
    }
  }

  // Selected-subset preview. Show ONLY the items the shopper ticked on
  // the Cart page — these are what will be ordered. Unselected rows
  // stay in the cart for later. Helps set expectations: the user sees
  // before they pay exactly what's heading into the order.
  const selectedItems = (cartData?.items || []).filter((i) => i?.product && i.selectedForCheckout);

  if (error && !data) {
    return <RetryError message="Couldn't load your addresses." onRetry={refetch} />;
  }

  return (
    <div className="pt-4 space-y-5">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate('/cart')} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold text-lg">Checkout</h1>
        <span className="w-10" />
      </header>

      {/* Progress */}
      <div className="flex items-center gap-2 text-label-md">
        {['Shipping', 'Payment', 'Review'].map((step, i) => (
          <div key={step} className="flex-1 flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${i === 0 ? 'bg-primary text-white' : 'bg-surface-high text-on-surface-variant'}`}>
              {i + 1}
            </div>
            <span className={i === 0 ? 'text-primary font-semibold' : 'text-on-surface-variant'}>{step}</span>
            {i < 2 && <div className="flex-1 h-px bg-outline-variant/40" />}
          </div>
        ))}
      </div>

      {/* Selected-items preview card. Renders only when cart data
          is loaded AND there's at least one selected row. If the user
          somehow landed on this page with all items unselected the
          cart page is the right next step, not this page. */}
      {selectedItems.length > 0 && (
        <details className="card p-3 group" open>
          <summary className="flex items-center gap-2 cursor-pointer list-none">
            <Icon name="shopping_bag" className="text-primary text-[20px]" />
            <span className="font-semibold text-sm">
              {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} heading your way
            </span>
            <span className="ml-auto group-open:rotate-180 transition-transform">
              <Icon name="expand_more" className="text-[18px] text-on-surface-variant" />
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {selectedItems.slice(0, 4).map((it) => (
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
                  <div className="text-label-md text-on-surface-variant">Qty {it.quantity} · {formatPrice(it.product.priceCents * it.quantity, currency)}</div>
                </div>
              </div>
            ))}
            {selectedItems.length > 4 && (
              <div className="text-label-md text-on-surface-variant text-center pt-1">
                +{selectedItems.length - 4} more
              </div>
            )}
          </div>
        </details>
      )}

      <h2 className="text-headline-md font-bold">Shipping address</h2>

      {addresses.length > 0 && (
        <div className="space-y-2">
          <div className="text-label-md text-on-surface-variant">Saved addresses</div>
          {addresses.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => setForm({
                recipientName: a.recipientName || '',
                street: a.line1,
                city: a.city,
                state: a.state,
                postal: a.postal,
                isDefault: a.isDefault,
              })}
              className="w-full card p-4 text-left flex items-start gap-3 hover:border-primary/40"
            >
              <Icon name="home" className="text-primary" />
              <div className="flex-1">
                <div className="font-semibold">{a.recipientName || a.line1}</div>
                <div className="text-label-md text-on-surface-variant">{a.line1}, {a.city}, {a.state} {a.postal}</div>
              </div>
            </button>
          ))}
          <div className="text-center text-label-md text-on-surface-variant my-2">— or add a new one —</div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-label-md text-on-surface-variant">Full name</label>
          <input className="input mt-1" required value={form.recipientName} onChange={(e) => update('recipientName', e.target.value)} placeholder="Recipient full name" />
        </div>
        <div>
          <label className="text-label-md text-on-surface-variant">Street address</label>
          <input className="input mt-1" required value={form.street} onChange={(e) => update('street', e.target.value)} placeholder="123 Main St, Apt 4B" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-label-md text-on-surface-variant">City</label>
            <input className="input mt-1" required value={form.city} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">State / Region</label>
            <input className="input mt-1" required value={form.state} onChange={(e) => update('state', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-label-md text-on-surface-variant">Postal code</label>
          <input className="input mt-1" required value={form.postal} onChange={(e) => update('postal', e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => update('isDefault', e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary" />
          Set as my default address
        </label>

        <div className="card h-32 bg-gradient-to-br from-surface-high to-surface-low flex items-center justify-center text-on-surface-variant">
          <div className="text-center">
            <Icon name="map" className="text-[28px]" />
            <div className="text-label-md mt-1">Map preview</div>
          </div>
        </div>

        {err && <div className="text-error text-sm">{err}</div>}

        <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t border-outline-variant/30">
          <div className="max-w-screen-md mx-auto">
            <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">
              {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Continue to Payment
              <Icon name="arrow_forward" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
