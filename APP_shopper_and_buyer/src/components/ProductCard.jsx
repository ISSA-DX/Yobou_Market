import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { useStore } from '../store';
import { productImage } from '../lib/productImage';
import { formatPrice } from '../lib/format';
import { replayAnimation } from '../lib/motion';

const FREE_DELIVERY_CENTS = 5000;
const LOW_STOCK = 5;

/**
 * Product card used in grids, rails and lists.
 * - `onAdd` is required for the add-to-cart button to do anything.
 * - Tapping the image/title opens product details.
 * - `layout="horizontal"` renders a list row (image left).
 */
export default function ProductCard({ product, onAdd, layout = 'grid' }) {
  const wishlist = useStore((s) => s.wishlist);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const saved = wishlist.includes(product.id);
  const cover = productImage(product);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  // Defensive: a missing .stock must not crash the related-products rail.
  const productStock = typeof product?.stock === 'number' ? product.stock : 0;
  const outOfStock = productStock === 0;
  const lowStock = !outOfStock && productStock <= LOW_STOCK;
  const price = formatPrice(product.priceCents, currency);
  const hasDeal = typeof product.compareAtPriceCents === 'number'
    && product.compareAtPriceCents > product.priceCents;
  const listPrice = hasDeal ? formatPrice(product.compareAtPriceCents, currency) : null;
  const dealPercent = hasDeal
    ? Math.round(((product.compareAtPriceCents - product.priceCents) / product.compareAtPriceCents) * 100)
    : 0;
  // Only real ratings are shown — never stars invented from other data.
  const hasRealRating = typeof product.rating === 'number' && product.rating > 0;
  const reviewCount = typeof product.reviewCount === 'number' ? product.reviewCount : 0;
  const freeDelivery = product.priceCents >= FREE_DELIVERY_CENTS;

  async function handleAdd(e) {
    e.preventDefault();
    if (outOfStock || adding || added) return;
    if (!onAdd) {
      // eslint-disable-next-line no-console
      console.warn('ProductCard rendered without onAdd; add-to-cart is disabled.');
      return;
    }
    setAdding(true);
    try {
      // Guests get a server-side session on first add, so the cart flow
      // never has to branch on auth state.
      await useStore.getState().ensureGuestSession();
      await onAdd(product);
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    } catch {
      // Errors are surfaced by the consumer (toast).
    } finally {
      setAdding(false);
    }
  }

  const isHorizontal = layout === 'horizontal';

  const addButton = (
    <button
      type="button"
      onClick={handleAdd}
      disabled={outOfStock || adding || !onAdd}
      aria-label={added ? 'Added to cart' : `Add ${product.name} to cart`}
      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition active:scale-90 ${
        added
          ? 'bg-emerald-500 text-white'
          : outOfStock || !onAdd
            ? 'bg-surface-high text-on-surface-variant cursor-not-allowed'
            : 'bg-primary text-white shadow-pop hover:brightness-110'
      }`}
    >
      <Icon
        name={adding ? 'progress_activity' : added ? 'check' : outOfStock ? 'block' : 'add_shopping_cart'}
        className={`text-[20px] ${adding ? 'animate-spin' : ''}`}
      />
    </button>
  );

  return (
    <div
      className={`group relative bg-white rounded-lg border border-outline-variant/50 shadow-card hover:shadow-float transition duration-200 overflow-hidden flex ${
        isHorizontal ? 'flex-row gap-3 p-2.5' : 'flex-col'
      }`}
    >
      {/* Image */}
      <Link
        to={`/product/${product.id}`}
        className={`relative bg-surface-low overflow-hidden shrink-0 ${
          isHorizontal ? 'w-28 h-28 sm:w-36 sm:h-36 rounded-md' : 'aspect-square'
        }`}
      >
        <img
          src={cover}
          alt={product.name}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
        />
        {outOfStock && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
            <span className="px-3 py-1 bg-on-surface text-white text-label-md font-bold rounded-full">Sold out</span>
          </div>
        )}
        {hasDeal && !outOfStock && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-sale text-white text-label-sm font-black shadow-card">
            -{dealPercent}%
          </span>
        )}
        <button
          type="button"
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          onClick={(e) => {
            e.preventDefault();
            if (!saved) replayAnimation(e.currentTarget, 'anim-heart');
            toggleWishlist(product.id);
          }}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-card transition active:scale-90 ${
            saved ? 'bg-white text-sale' : 'bg-white/90 text-on-surface-variant hover:text-sale'
          }`}
        >
          <Icon name="favorite" fill={saved} className="text-[18px]" />
        </button>
      </Link>

      {/* Content */}
      <div className={`flex flex-col flex-1 min-w-0 ${isHorizontal ? 'py-0.5' : 'p-3'}`}>
        <Link to={`/product/${product.id}`} className="block">
          <h3 className="text-sm font-medium text-on-surface line-clamp-2 leading-snug min-h-[2.5rem] group-hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>

        <div className="mt-1 flex items-center gap-1 min-h-[18px] text-label-md">
          {hasRealRating ? (
            <>
              <Icon name="star" fill className="text-[15px] text-secondary" />
              <span className="font-bold text-on-surface">{product.rating.toFixed(1)}</span>
              {reviewCount > 0 && <span className="text-on-surface-variant">({reviewCount})</span>}
            </>
          ) : (
            <span className="text-on-surface-variant">{product.vendor?.businessName || product.category}</span>
          )}
        </div>

        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-baseline gap-1.5 flex-wrap">
            <span className={`text-[17px] font-extrabold leading-none tracking-tight ${hasDeal ? 'text-sale' : 'text-on-surface'}`}>{price}</span>
            {hasDeal && <span className="text-label-md text-on-surface-variant line-through leading-none">{listPrice}</span>}
          </div>
          {addButton}
        </div>
        <div className={`mt-1.5 text-label-sm font-semibold flex items-center gap-1 whitespace-nowrap ${lowStock ? 'text-amber-600' : freeDelivery ? 'text-tertiary' : 'text-on-surface-variant'}`}>
          <Icon name={lowStock ? 'local_fire_department' : 'local_shipping'} className="text-[14px]" />
          {lowStock
            ? `Only ${productStock} left`
            : freeDelivery ? 'Free delivery' : `${formatPrice(499, currency)} delivery`}
        </div>
      </div>
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-outline-variant/50 shadow-card overflow-hidden flex flex-col">
      <div className="aspect-square skeleton rounded-none" />
      <div className="p-3 space-y-2">
        <div className="h-3.5 skeleton w-5/6" />
        <div className="h-3.5 skeleton w-2/3" />
        <div className="flex items-end justify-between pt-2">
          <div className="h-5 skeleton w-1/3" />
          <div className="w-10 h-10 skeleton rounded-full" />
        </div>
      </div>
    </div>
  );
}
