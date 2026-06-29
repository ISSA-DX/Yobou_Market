import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImages } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';

const COLORS = ['#0034b9', '#005121', '#fdc003', '#ba1a1a'];

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const refreshCart = useStore((s) => s.refreshCartCount);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const wishlist = useStore((s) => s.wishlist);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const { data, error, loading, refetch } = useApi(`/api/products/${id}`);
  const p = data?.product;
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState(0);
  const [activeImage, setActiveImage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const carouselRef = useRef(null);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActiveImage(idx);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [p]);

  useEffect(() => {
    // Reset quantity when switching products.
    if (p) setQty(1);
  }, [p?.id]);

  if (error && !data) {
    return <RetryError message="Couldn't load this product." onRetry={refetch} />;
  }
  if (!p) return <div className="p-8 text-center text-on-surface-variant">Loading…</div>;

  const images = productImages(p);
  const outOfStock = p.stock === 0;
  const saved = wishlist.includes(p.id);

  async function add() {
    setErr(''); setBusy(true);
    try {
      await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: qty } });
      await refreshCart();
      navigate('/cart');
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  async function buy() {
    setErr(''); setBusy(true);
    try {
      await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: qty } });
      await refreshCart();
      navigate('/checkout/shipping');
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  function handleError(e) {
    if (e.status === 401 || e.data?.error === 'UNAUTHENTICATED') {
      navigate('/login', { state: { from: location } });
      return;
    }
    setErr(humanizeCartError(e.data?.error));
  }

  return (
    <div className="pb-32">
      {/* Image carousel */}
      <div className="relative">
        <div ref={carouselRef} className="aspect-square bg-surface-low overflow-x-auto no-scrollbar snap-x snap-mandatory flex">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="w-full h-full object-cover snap-center shrink-0"
              onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
            />
          ))}
        </div>
        <div className="absolute top-3 inset-x-3 flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center">
            <Icon name="arrow_back" />
          </button>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center" aria-label="Share">
              <Icon name="share" />
            </button>
            <button
              onClick={() => toggleWishlist(p.id)}
              className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center"
              aria-label={saved ? 'Remove from saved' : 'Save'}
            >
              <Icon name="favorite" fill={saved} className={saved ? 'text-error' : 'text-on-surface'} />
            </button>
          </div>
        </div>
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
          {images.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === activeImage ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
          ))}
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">
        <div>
          <div className="text-label-md text-on-surface-variant uppercase">{p.category}</div>
          <h1 className="mt-1 text-headline-lg font-bold">{p.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-0.5 text-secondary">
              {[1,2,3,4,5].map((s) => <Icon key={s} name="star" fill={s <= 4} className="text-[16px]" />)}
            </div>
            <span className="text-label-md text-on-surface-variant">4.0 · {p.stock} in stock</span>
          </div>
          <div className="mt-3">
            <span className="text-headline-lg font-bold text-primary">{formatPrice(p.priceCents, currency)}</span>
          </div>
        </div>

        <div>
          <div className="text-label-md text-on-surface-variant mb-2">Color</div>
          <div className="flex gap-2">
            {COLORS.map((c, i) => (
              <button
                key={c}
                onClick={() => setColor(i)}
                className={`w-10 h-10 rounded-full border-2 transition`}
                style={{ background: c, borderColor: color === i ? '#0034b9' : 'transparent' }}
                aria-label={`Color ${i+1}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-label-md text-on-surface-variant">Quantity</div>
          <div className="flex items-center gap-3 bg-surface-low rounded-full px-3 py-1.5">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-7 h-7 rounded-full bg-white shadow-card flex items-center justify-center disabled:opacity-50"
            >
              <Icon name="remove" className="text-[16px]" />
            </button>
            <span className="font-semibold w-6 text-center">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(p.stock || 99, Math.max(1, q + 1)))}
              disabled={qty >= p.stock || outOfStock}
              className="w-7 h-7 rounded-full bg-white shadow-card flex items-center justify-center disabled:opacity-50"
            >
              <Icon name="add" className="text-[16px]" />
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-bold mb-2">Description</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">{p.description || 'No description provided.'}</p>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-tertiary-container/20 flex items-center justify-center">
            <Icon name="local_shipping" className="text-tertiary" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">
              {p.priceCents * qty >= 5000 ? 'Free delivery' : `Delivery ${formatPrice(499, currency)}`}
            </div>
            <div className="text-label-md text-on-surface-variant">Arrives in 2–4 business days</div>
          </div>
        </div>

        {err && <div className="text-error text-sm">{err}</div>}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t border-outline-variant/30 shadow-float">
        <div className="max-w-screen-md mx-auto grid grid-cols-2 gap-3">
          <button onClick={add} disabled={busy || outOfStock} className="btn-secondary py-3 disabled:opacity-60">
            <Icon name="shopping_bag" /> {outOfStock ? 'Sold out' : 'Add to Cart'}
          </button>
          <button onClick={buy} disabled={busy || outOfStock} className="btn-primary py-3 disabled:opacity-60">
            Buy Now
          </button>
        </div>
      </div>
    </div>
  );
}

function humanizeCartError(code) {
  switch (code) {
    case 'UNAUTHENTICATED': return 'Please sign in first.';
    case 'INSUFFICIENT_STOCK': return 'Not enough stock for the requested quantity.';
    case 'PRODUCT_NOT_AVAILABLE': return 'This product is no longer available.';
    default: return 'Could not add to cart.';
  }
}
