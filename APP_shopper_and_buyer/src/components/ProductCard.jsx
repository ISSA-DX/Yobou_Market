import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { useStore } from '../store';
import { productImage } from '../lib/productImage';
import { formatPrice } from '../lib/format';

// Centralize the free-delivery threshold so it matches backend / business rules.
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;
const LOW_STOCK_THRESHOLD = 5;

function discountFor(product) {
  if (!product?.compareAtPriceCents || product.compareAtPriceCents <= product.priceCents) return 0;
  return Math.round(((product.compareAtPriceCents - product.priceCents) / product.compareAtPriceCents) * 100);
}

/**
 * Product card used in grids and horizontal lists.
 * - `onAdd` is required for the Add to Cart button to do anything.
 * - Clicking the image/title navigates to product details.
 * - `badge` can be 'bestseller' | 'popular' | 'new' | string.
 */
export default function ProductCard({ product, onAdd, layout = 'grid', badge }) {
  const navigate = useNavigate();
  const location = useLocation();
  const wishlist = useStore((s) => s.wishlist);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const saved = wishlist.includes(product.id);
  const dataSaver = useStore((s) => s.dataSaver);
  const cover = productImage(product);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  // Defensive: a missing .stock throws a TypeError on the related-
  // products rail that crashes the parent PDP render. Coerce to 0
  // so the "Out of stock" overlay still appears correctly.
  const productStock = typeof product?.stock === 'number' ? product.stock : 0;
  const outOfStock = productStock === 0;
  const price = formatPrice(product.priceCents, currency);
  const hasDeal = typeof product.compareAtPriceCents === 'number'
    && product.compareAtPriceCents > product.priceCents;
  const listPrice = hasDeal
    ? formatPrice(product.compareAtPriceCents, currency)
    : null;
  const discount = product.discountPercent || discountFor(product);
  const lowStock = !outOfStock && product.stock <= LOW_STOCK_THRESHOLD;

  async function handleAdd(e) {
    e.preventDefault();
    if (outOfStock || adding) return;
    // v0.3.16: no longer redirect to /cart on the second click. The
    // "Added" state below is a visual confirmation only — the user
    // navigates to the cart explicitly via the cart icon in the
    // bottom nav. This is the Temu/Amazon pattern: keep the shopper
    // on the browsing surface so they can continue shopping
    // uninterrupted.
    if (added) return;
    if (!onAdd) {
      // eslint-disable-next-line no-console
      console.warn('ProductCard rendered without onAdd; add-to-cart is disabled.');
      return;
    }
    setAdding(true);
    try {
      // Make sure we have an authenticated session — guests get a
      // server-side user created on first add so the rest of the
      // cart flow doesn't need to branch on auth state. The previous
      // behavior of redirecting to /login on 401 is intentionally
      // removed: the user's spec is "guest can add to cart and buy
      // now without an account".
      await useStore.getState().ensureGuestSession();
      await onAdd(product);
      setAdded(true);
      setTimeout(() => setAdded(false), 3e3);
    } catch (e) {
      // Non-auth errors are surfaced by the consumer (toast/error state).
      // There is no longer a 401 → /login branch: ensureGuestSession
      // either succeeded (cart write proceeds) or failed (toast).
    } finally {
      setAdding(false);
    }
  }

  const isHorizontal = layout === 'horizontal';

  // Badge priority: discount % > custom badge > out-of-stock overlay.
  let badgeEl = null;
  if (discount > 0) {
    badgeEl = (
      <span className="absolute top-2 left-2 px-2 py-0.5 bg-error text-white text-[10px] font-bold rounded shadow-sm">
        -{discount}%
      </span>
    );
  } else if (badge || product.badge) {
    badgeEl = (
      <span className="absolute top-2 left-2 px-2 py-0.5 bg-secondary text-on-secondary text-[10px] font-bold rounded uppercase tracking-wide shadow-sm">
        {badge || product.badge}
      </span>
    );
  }

  const freeDelivery = product.priceCents >= FREE_SHIPPING_THRESHOLD_CENTS;

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
          isHorizontal ? 'w-28 h-28 sm:w-36 sm:h-36 rounded-md' : 'aspect-square'
        }`}
      >
        <img
          src={cover}
          alt={product.name}
          loading="lazy"
          onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
          className={`w-full h-full object-cover ${dataSaver ? '' : 'group-hover:scale-105 transition-transform duration-300'}`}
        />
        {outOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="px-3 py-1 bg-white text-on-surface text-xs font-semibold rounded-full">
              Out of stock
            </span>
          </div>
        )}
        {badgeEl}
        <button
          type="button"
          aria-label={saved ? 'Remove from wishlist' : 'Save for later'}
          onClick={(e) => {
            e.preventDefault();
            toggleWishlist(product.id);
          }}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition shadow-sm ${
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

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {product.soldCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-label-md text-on-surface-variant">
              <Icon name="local_fire_department" className="text-[14px] text-secondary" />
              {product.soldCount} sold
            </span>
          )}
          {lowStock && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-error/10 text-error text-[10px] font-semibold">
              Only {product.stock} left
            </span>
          )}
        </div>

        <div className="mt-auto pt-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-lg sm:text-xl font-bold text-on-surface">{price}</span>
            {listPrice && product.compareAtPriceCents > product.priceCents && (
              <span className="text-label-md text-on-surface-variant line-through">{listPrice}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {freeDelivery ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-semibold">
                <Icon name="local_shipping" className="text-[12px]" />
                FREE delivery
              </span>
            ) : (
              <span className="text-label-md text-on-surface-variant flex items-center gap-1">
                <Icon name="local_shipping" className="text-[14px]" />
                Delivery {formatPrice(499, currency)}
              </span>
            )}
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">
              <Icon name="payments" className="text-[12px]" />
              Pay on delivery
            </span>
            {product.vendor?.status === 'APPROVED' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">
                <Icon name="verified" className="text-[12px]" />
                Verified seller
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock || adding || !onAdd}
            className={`w-full mt-3 py-2.5 rounded-full text-sm font-semibold transition flex items-center justify-center ${
              added
                ? 'bg-green-50 border border-green-500 text-green-700 hover:bg-green-100'
                : outOfStock
                ? 'bg-surface-low text-on-surface-variant cursor-not-allowed'
                : !onAdd
                ? 'bg-surface-low text-on-surface-variant cursor-not-allowed'
                : 'bg-primary text-white hover:bg-primary/90 shadow-sm active:scale-[0.98]'
            }`}
          >
            {adding ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="progress_activity" className="text-[18px] animate-spin" />
                Adding…
              </span>
            ) : added ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" className="text-[18px]" />
                Added
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
