import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImages } from '../../lib/productImage';
import { colorToHex } from '../../lib/colorSwatch';
import { formatPrice } from '../../lib/format';
import { useCatalogStream } from '../../lib/useSse';
import { useRecentlyViewed } from '../../lib/useRecentlyViewed';
import ProductDescriptionTabs from './ProductDescriptionTabs';
import RelatedProducts from './RelatedProducts';

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const refreshCart = useStore((s) => s.refreshCartCount);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const wishlist = useStore((s) => s.wishlist);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const { data, error, loading, refetch } = useApi(`/api/products/${id}`);
  // Record this view for the "Recently viewed" rail on Home. Fires once
  // per product load — we don't track on every refetch so a live-sync
  // event doesn't bubble the same product back to the top.
  const { track: trackRecent } = useRecentlyViewed();
  const trackedRef = useRef(null);
  // Live sync — refetch when an event targets THIS product. Includes
  // product_variants_changed so a vendor/admin editing the variant
  // matrix updates the storefront without a manual refresh.
  useCatalogStream((frame) => {
    if (!frame?.event) return;
    if (
      frame.event !== 'product_updated'
      && frame.event !== 'product_deleted'
      && frame.event !== 'product_variants_changed'
    ) return;
    const targetId = frame.productId || frame.meta?.productId;
    if (targetId && targetId !== id) return;
    refetch();
  });
  const p = data?.product;
  // Record the view in the recently-viewed list once the product is
  // resolved. The ref guard prevents re-tracking on live-sync refetches
  // for the same product, which would otherwise bubble it to the top
  // every time a vendor edits a variant.
  useEffect(() => {
    if (p?.id && trackedRef.current !== p.id) {
      trackedRef.current = p.id;
      trackRecent(p.id);
    }
  }, [p?.id, trackRecent]);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const carouselRef = useRef(null);

  // Variant selection state. Initialised lazily from `p.variants` so
  // we don't re-pick on every refetch — the chosen variant stays sticky
  // until the user changes it or the variant list itself changes.
  const variants = Array.isArray(p?.variants) ? p.variants : [];
  const [pickedColor, setPickedColor] = useState('');
  const [pickedSize, setPickedSize] = useState('');

  // Amazon-style "quick-pick" default size: pick the size that's most
  // commonly available across colors (the one with the most variant
  // rows). Ties break in iteration order. This gives the shopper a
  // sensible default — usually M, the size most colors carry — instead
  // of the first size the form happened to list.
  const defaultSize = useMemo(() => {
    if (variants.length === 0) return '';
    const counts = new Map();
    variants.forEach((v) => counts.set(v.size, (counts.get(v.size) || 0) + 1));
    let best = variants[0].size;
    let bestN = 0;
    for (const [s, n] of counts) if (n > bestN) { best = s; bestN = n; }
    return best;
  }, [variants]);

  useEffect(() => {
    if (variants.length === 0) {
      setPickedColor('');
      setPickedSize('');
      return;
    }
    if (!variants.some((v) => v.color === pickedColor)) setPickedColor(variants[0].color);
    if (!variants.some((v) => v.size === pickedSize)) setPickedSize(defaultSize);
  }, [variants, pickedColor, pickedSize, defaultSize]);

  const uniqueColors = useMemo(() => {
    const s = new Set();
    variants.forEach((v) => v.color && s.add(v.color));
    return Array.from(s);
  }, [variants]);
  const uniqueSizes = useMemo(() => {
    const s = new Set();
    variants.forEach((v) => v.size && s.add(v.size));
    return Array.from(s);
  }, [variants]);

  // Look up the matching variant row from the (color, size) pair. If
  // the pair doesn't exist (e.g. Black × XL not stocked) we still let
  // the shopper see the price + images but the "Add to cart" button
  // stays disabled with an explanatory message.
  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    const exact = variants.find((v) => v.color === pickedColor && v.size === pickedSize);
    if (exact) return exact;
    // Fall back to "any variant with the picked color" so the live
    // stock hint still reflects something sensible.
    return variants.find((v) => v.color === pickedColor) || variants[0];
  }, [variants, pickedColor, pickedSize]);

  // Carousel images: prefer the picked color's per-row imageUrls if any
  // variants are defined and the picked color has its own photos,
  // otherwise fall back to the product-level imageUrls. This is the
  // "shopper sees the red shirt when they pick Red" behavior.
  const pickedVariantImages = useMemo(() => {
    if (variants.length === 0 || !pickedColor) return null;
    const match = variants.find(
      (v) => v.color === pickedColor && Array.isArray(v.imageUrls) && v.imageUrls.length > 0,
    );
    return match ? match.imageUrls : null;
  }, [variants, pickedColor]);

  const hasVariants = variants.length > 0;
  const variantStock = selectedVariant ? selectedVariant.stock : null;
  const outOfStock = hasVariants
    ? (variantStock === null || variantStock === 0)
    : p.stock === 0;
  const exactMatch = hasVariants
    && variants.some((v) => v.color === pickedColor && v.size === pickedSize);

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

  // Image list for the carousel: per-color override when available,
  // otherwise the product-level gallery. Memoised so the swipe state
  // (`activeImage`) only resets when the array identity changes.
  const images = useMemo(
    () => pickedVariantImages || productImages(p),
    [pickedVariantImages, p],
  );

  // Reset the active-image pointer when the gallery changes so the
  // shopper doesn't see a stale "page 3 of 4" indicator after switching
  // to a color with fewer photos.
  useEffect(() => {
    setActiveImage(0);
    const el = carouselRef.current;
    if (el) el.scrollLeft = 0;
  }, [images]);

  if (error && !data) {
    return <RetryError message="Couldn't load this product." onRetry={refetch} />;
  }
  if (!p) return <div className="p-8 text-center text-on-surface-variant">Loading…</div>;

  const saved = wishlist.includes(p.id);

  async function add() {
    setErr(''); setBusy(true);
    try {
      await api('/api/cart', {
        method: 'POST',
        body: {
          productId: p.id,
          variantId: hasVariants && selectedVariant ? selectedVariant.id : null,
          quantity: qty,
        },
      });
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
      await api('/api/cart', {
        method: 'POST',
        body: {
          productId: p.id,
          variantId: hasVariants && selectedVariant ? selectedVariant.id : null,
          quantity: qty,
        },
      });
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
            {typeof p.rating === 'number' && p.rating > 0 ? (
              <>
                <div className="flex items-center gap-0.5 text-secondary">
                  {[1,2,3,4,5].map((s) => (
                    <Icon key={s} name="star" fill={s <= Math.round(p.rating)} className="text-[16px]" />
                  ))}
                </div>
                <a href="#reviews" className="text-label-md text-on-surface-variant hover:text-primary">
                  {p.rating.toFixed(1)}{typeof p.reviewCount === 'number' && p.reviewCount > 0 ? ` (${p.reviewCount} review${p.reviewCount === 1 ? '' : 's'})` : ''} · {p.stock} in stock
                </a>
              </>
            ) : (
              <a href="#reviews" className="text-label-md text-on-surface-variant/70 italic hover:text-primary">
                No reviews yet · {p.stock} in stock
              </a>
            )}
          </div>
          <div className="mt-3">
            <span className="text-headline-lg font-bold text-primary">{formatPrice(p.priceCents, currency)}</span>
          </div>
        </div>

        {hasVariants && (
          <div>
            <div className="text-label-md text-on-surface-variant mb-2">Color</div>
            <div className="flex flex-wrap gap-2">
              {uniqueColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPickedColor(c)}
                  className={`flex items-center gap-2 px-3 h-10 rounded-full border transition ${pickedColor === c ? 'border-primary bg-primary-container/30' : 'border-outline-variant/40 bg-white'}`}
                  aria-pressed={pickedColor === c}
                  aria-label={`Color ${c}`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-outline-variant/40 shrink-0"
                    style={{ background: colorToHex(c) }}
                  />
                  <span className="text-sm font-medium">{c}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {hasVariants && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-label-md text-on-surface-variant">
                Size
                {pickedColor && <span className="text-on-surface"> · {pickedColor}</span>}
              </div>
              {/* Stock hint for the picked (color, size). When the exact
                  pair exists, the number is the variant's stock. When it
                  doesn't, we show "— sold out" so the shopper isn't
                  confused by an empty cell. */}
              {selectedVariant && pickedColor && pickedSize && (
                <div
                  className={`text-label-md font-medium ${
                    selectedVariant.color === pickedColor
                    && selectedVariant.size === pickedSize
                    && selectedVariant.stock > 0
                      ? 'text-tertiary'
                      : 'text-error'
                  }`}
                  aria-live="polite"
                >
                  {selectedVariant.color === pickedColor
                  && selectedVariant.size === pickedSize
                  && selectedVariant.stock > 0
                    ? `${selectedVariant.stock} in stock`
                    : 'Sold out'}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {uniqueSizes.map((s) => {
                // Amazon-style: a size is shown as available to click
                // even if the *current* color doesn't carry it (the
                // shopper might switch colors), but the cell is struck
                // when this specific (color, size) combo is out of stock
                // or doesn't exist. We disable the click only when no
                // color at all carries this size — clicking it would
                // never lead to a buyable pick.
                const exact = pickedColor
                  ? variants.find((v) => v.color === pickedColor && v.size === s)
                  : null;
                const stockForThisColor = exact
                  ? (typeof exact.stock === 'number' ? exact.stock : 0)
                  : 0;
                const isPicked = pickedSize === s;
                // Carry-any-color: is there at least one variant row
                // (any color) with this size that has stock? If not,
                // disable the button entirely.
                const anyColorCarriesSize = variants.some(
                  (v) => v.size === s && typeof v.stock === 'number' && v.stock > 0,
                );
                const disabled = !anyColorCarriesSize;
                // Strike state: a cell that's still clickable (because
                // another color carries it) but unavailable for the
                // current pick. Visualised as line-through so the
                // shopper knows to either pick a different color or a
                // different size.
                const isOosForPicked = !disabled && (stockForThisColor === 0);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPickedSize(s)}
                    disabled={disabled}
                    aria-pressed={isPicked}
                    aria-disabled={isOosForPicked || undefined}
                    title={isOosForPicked
                      ? `${pickedColor} × ${s} — out of stock`
                      : undefined}
                    className={`min-w-[3rem] h-10 px-3 rounded-full border text-sm font-medium transition ${
                      isPicked
                        ? 'border-primary bg-primary text-white'
                        : disabled
                          ? 'border-outline-variant/30 bg-surface-low text-on-surface-variant/40 line-through cursor-not-allowed'
                          : isOosForPicked
                            ? 'border-outline-variant/40 bg-white text-on-surface/50 line-through'
                            : 'border-outline-variant/40 bg-white text-on-surface'
                    }`}
                    aria-label={`Size ${s}${disabled ? ' (out of stock in all colors)' : isOosForPicked ? ` (out of stock in ${pickedColor})` : ''}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {!exactMatch && (
              <div className="mt-2 text-label-md text-error">
                {pickedColor} × {pickedSize} isn't stocked — try another size or color.
              </div>
            )}

            {/* In-page Quick add. Amazon-style: an explicit one-tap
                CTA above the description so the shopper doesn't have to
                scroll past the spec tabs to commit. The same logic as
                the sticky bottom buttons (disabled when the pick is
                OOS or invalid). Renders only on variant products. */}
            <button
              type="button"
              onClick={add}
              disabled={busy || outOfStock || !exactMatch}
              className="mt-4 w-full btn-primary py-3 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy ? (
                <Icon name="progress_activity" className="text-[18px] animate-spin" />
              ) : (
                <Icon name="shopping_bag" />
              )}
              {exactMatch
                ? `Add ${pickedColor} × ${pickedSize} to cart · ${formatPrice(p.priceCents, currency)}`
                : outOfStock
                  ? 'Sold out'
                  : 'Pick a color and size'}
            </button>
          </div>
        )}

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
              onClick={() => setQty((q) => {
                const cap = hasVariants
                  ? (exactMatch && variantStock !== null ? variantStock : 0)
                  : (p.stock || 99);
                return Math.min(cap || 99, Math.max(1, q + 1));
              })}
              disabled={qty >= (hasVariants ? (variantStock || 0) : (p.stock || 99)) || outOfStock}
              className="w-7 h-7 rounded-full bg-white shadow-card flex items-center justify-center disabled:opacity-50"
            >
              <Icon name="add" className="text-[16px]" />
            </button>
          </div>
        </div>

        <ProductDescriptionTabs product={p} onChanged={() => refetch()} />

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

        <RelatedProducts productId={p.id} onAdd={add} />
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-white border-t border-outline-variant/30 shadow-float">
        <div className="max-w-screen-md mx-auto grid grid-cols-2 gap-3">
          <button
            onClick={add}
            disabled={busy || outOfStock || (hasVariants && !exactMatch)}
            className="btn-secondary py-3 disabled:opacity-60"
          >
            <Icon name="shopping_bag" />
            {hasVariants && !exactMatch
              ? 'Unavailable combo'
              : outOfStock
                ? 'Sold out'
                : 'Add to Cart'}
          </button>
          <button
            onClick={buy}
            disabled={busy || outOfStock || (hasVariants && !exactMatch)}
            className="btn-primary py-3 disabled:opacity-60"
          >
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
    case 'INVALID_VARIANT': return 'That color/size combination is no longer available.';
    default: return 'Could not add to cart.';
  }
}
