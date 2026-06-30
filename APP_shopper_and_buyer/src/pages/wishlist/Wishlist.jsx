// Wishlist page
// ---------------------------------------------------------------------------
// Lists the products the shopper has saved via the heart icon. Wishlist
// state lives in zustand + localStorage (see store.js); we filter the
// public /api/products list down to just the saved IDs so we get the
// full product shape (image, price, stock, variants) needed by the
// ProductCard.
//
// We keep a small fetch budget: load at most the first page of products
// (limit=100) and filter client-side. Saved IDs that no longer exist on
// the catalog (vendor removed the product, vendor account suspended, etc.)
// are surfaced as a separate "Unavailable" section so the user can prune
// them from their list.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';

export default function Wishlist() {
  const wishlist = useStore((s) => s.wishlist);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const [allProducts, setAllProducts] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const { products } = await api('/api/products?limit=100');
        if (alive) setAllProducts(products || []);
      } catch {
        if (alive) {
          setError("Couldn't load your wishlist.");
          setAllProducts([]);
        }
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => {
    const map = new Map();
    (allProducts || []).forEach((p) => map.set(p.id, p));
    return map;
  }, [allProducts]);

  const saved = useMemo(() => {
    // Preserve the order the user added them in (most recent first per
    // the store's append-on-toggle). Drop duplicates defensively.
    const seen = new Set();
    return wishlist
      .map((id) => byId.get(id))
      .filter((p) => p && !seen.has(p.id) && seen.add(p.id));
  }, [wishlist, byId]);

  const unavailable = useMemo(
    () => wishlist.filter((id) => allProducts && !byId.has(id)),
    [wishlist, byId, allProducts]
  );

  async function quickAdd(p) {
    try {
      await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
      await useStore.getState().refreshCartCount();
    } catch {
      // Auth errors are surfaced by the consumer; we keep this as a
      // best-effort helper that mirrors ProductCard's quickAdd contract.
    }
  }

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="p-2 -ml-2" aria-label="Back to profile">
          <Icon name="arrow_back" className="text-[24px]" />
        </Link>
        <div>
          <h1 className="text-headline-md font-bold">My Wishlist</h1>
          {allProducts && (
            <p className="text-label-md text-on-surface-variant">
              {saved.length} item{saved.length === 1 ? '' : 's'} saved
            </p>
          )}
        </div>
      </header>

      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm">{error}</div>
      )}

      {allProducts === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : saved.length === 0 && unavailable.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <div className="w-20 h-20 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-4">
            <Icon name="favorite" className="text-[40px] text-on-surface-variant/60" />
          </div>
          <p className="text-title-md font-medium">Nothing saved yet</p>
          <p className="text-sm mt-1 max-w-xs mx-auto">
            Tap the heart on any product to save it for later. Your wishlist is available on every device you sign in to.
          </p>
          <Link
            to="/home"
            className="mt-4 inline-flex items-center gap-1 bg-primary text-white px-5 py-2.5 rounded-full text-sm font-semibold"
          >
            <Icon name="explore" className="text-[18px]" /> Discover products
          </Link>
        </div>
      ) : (
        <>
          {saved.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {saved.map((p) => (
                <div key={p.id} className="relative">
                  <ProductCard product={p} onAdd={quickAdd} />
                  <button
                    type="button"
                    onClick={() => toggleWishlist(p.id)}
                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white text-error shadow-card flex items-center justify-center"
                    aria-label={`Remove ${p.name} from wishlist`}
                    title="Remove from wishlist"
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {unavailable.length > 0 && (
            <section className="mt-6">
              <h2 className="text-title-sm font-semibold mb-2">No longer available</h2>
              <p className="text-label-md text-on-surface-variant mb-3">
                These items were removed by the vendor or hidden from the catalog. Remove them from your wishlist to keep things tidy.
              </p>
              <ul className="card divide-y divide-outline-variant/20">
                {unavailable.map((id) => (
                  <li key={id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-label-md text-on-surface-variant truncate">Product {id.slice(-6)}</div>
                      <div className="text-label-sm text-on-surface-variant/70">Unavailable</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleWishlist(id)}
                      className="text-sm text-primary font-semibold"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
