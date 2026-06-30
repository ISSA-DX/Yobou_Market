import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Icon from './Icon';
import { useStore } from '../store';
import { productImage } from '../lib/productImage';
import { formatPrice } from '../lib/format';

/**
 * Product card used in grids and horizontal lists.
 * - `onAdd` is required for the Add to Cart button to do anything.
 * - Clicking the image/title navigates to product details.
 */
export default function ProductCard({ product, onAdd, layout = 'grid' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const wishlist = useStore((s) => s.wishlist);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const saved = wishlist.includes(product.id);
  const cover = productImage(product);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const outOfStock = product.stock === 0;
  const price = formatPrice(product.priceCents, currency);
  const listPrice = product.compareAtPriceCents
    ? formatPrice(product.compareAtPriceCents, currency)
    : null;
  // Real ratings live on the product when the catalog exposes them. Until
  // the backend ships a real rating pipeline, we render an honest
  // "No reviews yet" chip rather than fake stars derived from stock.
  // This avoids misleading shoppers about product quality.
  const hasRealRating = typeof product.rating === 'number' && product.rating > 0;
  const reviewCount = typeof product.reviewCount === 'number' ? product.reviewCount : 0;

  async function handleAdd(e) {
    e.preventDefault();
    if (outOfStock || adding) return;
    if (added) {
      navigate('/cart');
      return;
    }
    if (!onAdd) {
      // eslint-disable-next-line no-console
      console.warn('ProductCard rendered without onAdd; add-to-cart is disabled.');
      return;
    }
    setAdding(true);
    try {
      await onAdd(product);
      setAdded(true);
      setTimeout(() => setAdded(false), 3e3);
    } catch (e) {
      if (e.status === 401 || e.data?.error === 'UNAUTHENTICATED') {
        navigate('/login', { state: { from: location } });
      }
      // Non-auth errors are surfaced by the consumer (toast/error state).
    } finally {
      setAdding(false);
    }
  }

  const isHorizontal = layout === 'horizontal';

  return (
    <div
      className={`group bg-white rounded-lg border border-outline-variant/20 shadow-card hover:shadow-float transition overflow-hidden flex ${
        isHorizontal ? 'flex-row gap-4 p-3' : 'flex-col'
      }`}
    >
      {/* Image */}
      <Link
        to={`/product/${product.id}`}
        className={`relative bg-surface-low overflow-hidden shrink-0 ${
          isHorizontal ? 'w-32 h-32 sm:w-40 sm:h-40 rounded-md' : 'aspect-square'
        }`}
      >
        <img
          src={cover}
          alt={product.name}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {outOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="px-3 py-1 bg-white text-on-surface text-xs font-semibold rounded-full">
              Out of stock
            </span>
          </div>
        )}
        {product.status === 'LIVE' && !outOfStock && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-secondary text-on-secondary text-[10px] font-bold rounded uppercase tracking-wide">
            In Stock
          </span>
        )}
        <button
          type="button"
          aria-label={saved ? 'Remove from wishlist' : 'Save for later'}
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
          }}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition ${
            saved
              ? 'bg-white text-error'
              : 'bg-white/90 text-on-surface-variant opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          }`}
        >
          <Icon name="favorite" fill={saved} className="text-[18px]" />
        </button>
      </Link>

      {/* Content */}
      <div className={`flex flex-col flex-1 min-w-0 ${isHorizontal ? '' : 'p-3'}`}>
        <Link to={`/product/${product.id}`} className="block">
          <div className="text-label-md text-on-surface-variant uppercase tracking-wide line-clamp-1">
            {product.category}
          </div>
          <h3 className="mt-0.5 text-sm sm:text-base font-medium text-on-surface line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>

        <div className="mt-1.5 flex items-center gap-1.5 min-h-[20px]">
          {hasRealRating ? (
            <>
              <div className="flex items-center">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Icon
                    key={s}
                    name="star"
                    fill={s <= Math.round(product.rating)}
                    className={`text-[14px] ${s <= Math.round(product.rating) ? 'text-secondary' : 'text-surface-high'}`}
                  />
                ))}
              </div>
              <span className="text-label-md text-on-surface-variant">{product.rating.toFixed(1)}{reviewCount > 0 ? ` (${reviewCount})` : ''}</span>
            </>
          ) : (
            <span className="text-label-md text-on-surface-variant/70 italic">No reviews yet</span>
          )}
        </div>

        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg sm:text-xl font-bold text-on-surface">{price}</span>
            {listPrice && product.compareAtPriceCents > product.priceCents && (
              <span className="text-label-md text-on-surface-variant line-through">{listPrice}</span>
            )}
          </div>
          <div className="mt-1 text-label-md text-tertiary flex items-center gap-1">
            <Icon name="local_shipping" className="text-[14px]" />
            {product.priceCents >= 5000
              ? 'FREE delivery'
              : `Delivery ${formatPrice(499, currency)}`}
          </div>
        </div>

        <div className={`mt-auto ${isHorizontal ? 'mt-3' : 'mt-3'}`}>
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock || adding || !onAdd}
            className={`w-full py-2.5 rounded-full text-sm font-semibold transition flex items-center justify-center ${
              added
                ? 'bg-green-50 border border-green-500 text-green-700 hover:bg-green-100'
                : outOfStock
                ? 'bg-surface-low text-on-surface-variant cursor-not-allowed'
                : !onAdd
                ? 'bg-surface-low text-on-surface-variant cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary/90 shadow-sm'
            }`}
          >
            {adding ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="progress_activity" className="text-[18px] animate-spin" />
                Adding…
              </span>
            ) : added ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="shopping_cart" className="text-[18px]" />
                Go to Cart
              </span>
            ) : outOfStock ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="block" className="text-[18px]" />
                Out of stock
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="add_shopping_cart" className="text-[18px]" />
                Add to Cart
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-outline-variant/20 shadow-card overflow-hidden flex flex-col">
      <div className="aspect-square bg-surface-low animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-surface-low rounded animate-pulse w-2/3" />
        <div className="h-4 bg-surface-low rounded animate-pulse w-3/4" />
        <div className="h-5 bg-surface-low rounded animate-pulse w-1/2" />
        <div className="h-9 bg-surface-low rounded-full animate-pulse" />
      </div>
    </div>
  );
}
