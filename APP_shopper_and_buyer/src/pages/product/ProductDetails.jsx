import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { categoryPath } from '../../lib/categoryTheme';
import { toast } from '../../lib/toast';
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

  // Amazon-style "quick-pick" default: pick the variant row (color ×
  // size) that has the highest stock. Picking a SINGLE ROW rather than
  // independently picking the top color AND the top size guarantees
  // the auto-picked pair actually exists in the variant matrix — the
  // old "most-common color × most-common size" algo could collapse to
  // an OOS combo (e.g. Black has no M), which left the Add-to-Cart
  // button silently disabled on PDP load. This single-row pick is the
  // fix: it's a real variant, it has inventory, and exactMatch is true
  // before the shopper touches anything.
  const defaultVariant = useMemo(() => {
    if (variants.length === 0) return null;
    let best = variants[0];
    for (const v of variants) {
      const vStock = typeof v.stock === 'number' ? v.stock : 0;
      const bestStock = typeof best.stock === 'number' ? best.stock : 0;
      if (vStock > bestStock) best = v;
    }
    return best;
  }, [variants]);
  const defaultSize = defaultVariant ? defaultVariant.size : '';
  const defaultColor = defaultVariant ? defaultVariant.color : '';

  useEffect(() => {
    if (variants.length === 0) {
      setPickedColor('');
      setPickedSize('');
      return;
    }
    // Snap to the highest-stock variant when the current (color, size)
    // pair doesn't correspond to any variant row — covers both first
    // visit (gives the shopper a sensible default) and live-sync
    // deletion (a vendor just removed the variant the user was on).
    if (!variants.some((v) => v.color === pickedColor && v.size === pickedSize)) {
      setPickedColor(defaultColor);
      setPickedSize(defaultSize);
    }
  }, [variants, pickedColor, pickedSize, defaultColor, defaultSize]);

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
  // CRITICAL defensive: this line fires during the FIRST render,
  // before useApi's data resolves. At that point `p === undefined`
  // (because `data?.product` short-circuits). The `if (!p) return
  // Loading…` early-exit only runs LATER (after the hooks), which
  // means every derived constant above the early-exit MUST tolerate
  // `p === undefined`. The unguarded `p.stock === 0` was throwing a
  // TypeError that, captured by the route's ErrorBoundary, blanked
  // the PDP and made the sticky "Add to cart" button unreachable —
  // and the shopper interpreted it as "add to cart doesn't work".
  // The optional-chained `p?.stock === 0` returns `false` for
  // undefined products, which trivially keeps the button enabled
  // during the loading flash (the early-exit shows Loading… anyway).
  const outOfStock = hasVariants
    ? (variantStock === null || variantStock === 0)
    : p?.stock === 0;
  const exactMatch = hasVariants
    && variants.some((v) => v.color === pickedColor && v.size === pickedSize);
  // Urgency-stock number used by the inline "Only N left" hint on
  // the delivery card. For a variant product we use the picked
  // variant's stock ONLY when the (color, size) pair is exact —
  // if the colour is picked but the size isn't stocked we don't
  // invent urgency. For a non-variant product we fall back to
  // p.stock. Wrapped in useMemo to match the file's pattern for
  // derived values (defaultSize, uniqueColors, images, etc.).
  const stockForUrgency = useMemo(
    () => (hasVariants
      ? (exactMatch ? (variantStock || 0) : 0)
      : (p?.stock || 0)),
    [hasVariants, exactMatch, variantStock, p?.stock],
  );
  const showStockUrgency = stockForUrgency > 0 && stockForUrgency <= 5;

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

  // Send the chosen variant if the (color, size) pair matches an
  // actual variant row. Otherwise send the highest-stock variant as a
  // safety fallback so the shopper is NEVER stuck on a dead Add — the
  // button stays clickable, the server validates stock, and the user
  // lands on /cart with a meaningful row. Without this fallback the
  // PDP was effectively unusable on variant products whose first row's
  // color happens to lack the most-common size.
  function pickVariantToSend() {
    if (!hasVariants) return null;
    if (exactMatch && selectedVariant) return selectedVariant;
    // hasVariants guarantees variants.length > 0, so defaultVariant is
    // never null here. We fall back to the highest-stock row so the
    // shopper is NEVER stuck on a dead Add — even a misbehaving variant
    // matrix (e.g. color×size gaps) ends on a buyable, in-stock SKU.
    return defaultVariant;
  }

  async function add(e) {
    // Defensive: in Capacitor/Android WebViews a <button> without an
    // explicit type can trigger a form submission or a native reload
    // on tap. Preventing default here guarantees the click is handled
    // purely by React.
    e?.preventDefault?.();
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      // Guests get a silent server-side user on first cart-add so the
      // existing /api/cart endpoint handles both logged-in customers
      // and guests without client-side branching. On 401 we re-mint
      // once via ensureGuestSession and retry — this covers the rare
      // case where the access token expired mid-session (refresh
      // cookie blown away). The orphan User row from the old guest
      // identity gets cleaned up by the 30-day purge cron.
      const sendVariant = pickVariantToSend();
      await withGuestRetry(() => api('/api/cart', {
        method: 'POST',
        body: {
          productId: p.id,
          variantId: sendVariant ? sendVariant.id : null,
          quantity: qty,
        },
      }));
      await refreshCart();
      toast.addedToCart(p);
      // v0.3.16: no longer navigate to /cart. The cart badge in
      // MobileShell updates via refreshCartCount() above, the sticky
      // CTA flips to a "Added" state for 3s, and the in-page Quick
      // add button mirrors the same confirmation. The user stays on
      // the PDP so they can keep shopping (or tap the cart icon in
      // the bottom nav to checkout). The "Buy Now" button below
      // (handled by `buy()`) still navigates to /checkout/shipping
      // because that flow is an explicit intent to purchase.
    } catch (ex) {
      handleError(ex);
    } finally {
      setBusy(false);
    }
  }

  // Share: the native sheet where the browser/OS has one; otherwise copy
  // the link and offer WhatsApp — the shopper always sees a result.
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: p.name, text: `${p.name} on Yobou`, url });
        return;
      } catch (ex) {
        if (ex?.name === 'AbortError') return; // shopper closed the sheet
      }
    }
    const whatsapp = { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${p.name} — ${url}`)}` };
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { action: whatsapp });
    } catch {
      toast.info('Share this product on WhatsApp', { action: whatsapp });
    }
  }

  // Run `fn` once. If it returns a 401, run ensureGuestSession (which
  // re-mints a server-side user if zustand is empty, or is a no-op if
  // a user exists) and retry once. Anything non-401 surfaces as-is.
  async function withGuestRetry(fn) {
    try {
      return await fn();
    } catch (ex) {
      if (ex?.status !== 401) throw ex;
      await useStore.getState().ensureGuestSession();
      return await fn();
    }
  }

  async function buy(e) {
    e?.preventDefault?.();
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const sendVariant = pickVariantToSend();
      await withGuestRetry(() => api('/api/cart', {
        method: 'POST',
        body: {
          productId: p.id,
          variantId: sendVariant ? sendVariant.id : null,
          quantity: qty,
        },
      }));
      await refreshCart();
      navigate('/checkout/shipping');
    } catch (ex) {
      handleError(ex);
    } finally {
      setBusy(false);
    }
  }

  function handleError(e) {
    // The previous behavior of redirecting to /login on 401 is removed
    // \u2014 guests can add to cart and start checkout without an account.
    // ensureGuestSession runs *before* the cart write, so by the time we
    // get a 401 it's a real out-of-the-ordinary failure. Surface the
    // humanized message so the shopper knows what to do next.
    setErr(humanizeCartError(e.data?.error));
  }

  // Add to cart / Buy now — in the sticky bottom bar on phones, inline in
  // the details column on laptops.
  const ctaDisabled = busy || outOfStock || (hasVariants && !exactMatch);
  const ctaButtons = (
    <>
      <button type="button" onClick={add} disabled={ctaDisabled} className="btn-secondary py-3 disabled:opacity-60">
        <Icon name="shopping_bag" />
        {hasVariants && !exactMatch ? 'Unavailable combo' : outOfStock ? 'Sold out' : 'Add to Cart'}
      </button>
      <button type="button" onClick={buy} disabled={ctaDisabled} className="btn-primary py-3 disabled:opacity-60">
        Buy Now
      </button>
    </>
  );
  const showImage = (i) => {
    const el = carouselRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="pb-32 lg:pb-4 lg:pt-6 lg:px-4">
      {/* Laptops: breadcrumb instead of the floating back button. */}
      <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-1 text-sm text-on-surface-variant mb-5 min-w-0">
        <Link to="/home" className="hover:text-primary">Home</Link>
        <Icon name="chevron_right" className="text-[18px]" />
        <Link to={categoryPath({ name: p.category })} className="hover:text-primary">{p.category}</Link>
        {p.subcategory && (
          <>
            <Icon name="chevron_right" className="text-[18px]" />
            <Link to={categoryPath({ name: p.category }, { name: p.subcategory })} className="hover:text-primary">{p.subcategory}</Link>
          </>
        )}
        <Icon name="chevron_right" className="text-[18px]" />
        <span className="text-on-surface truncate">{p.name}</span>
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 xl:gap-14 lg:items-start">
      {/* Image carousel */}
      <div className="lg:sticky lg:top-[148px]">
      <div className="relative lg:rounded-3xl lg:overflow-hidden lg:ring-1 lg:ring-outline-variant/40">
        <div ref={carouselRef} className="reveal reveal-blur aspect-square bg-surface-low overflow-x-auto no-scrollbar snap-x snap-mandatory flex">
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
          {/* Defensive type="button" on every PDP button. Sticky
              CTA was already fixed in the v0.3.9 patch; these close
              the same `type="submit"` WebView quirk for the rest of
              the page so no PDP button can reload the WebView. */}
          <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center lg:invisible" aria-label="Back">
            <Icon name="arrow_back" />
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={share} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center" aria-label="Share">
              <Icon name="share" />
            </button>
            <button
              type="button"
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
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => showImage(Math.max(0, activeImage - 1))} disabled={activeImage === 0} aria-label="Previous photo" className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 shadow-card items-center justify-center disabled:opacity-0 transition-opacity">
              <Icon name="chevron_left" className="text-[26px]" />
            </button>
            <button type="button" onClick={() => showImage(Math.min(images.length - 1, activeImage + 1))} disabled={activeImage === images.length - 1} aria-label="Next photo" className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 shadow-card items-center justify-center disabled:opacity-0 transition-opacity">
              <Icon name="chevron_right" className="text-[26px]" />
            </button>
          </>
        )}
      </div>
      {/* Laptops: thumbnail strip. */}
      {images.length > 1 && (
        <div className="hidden lg:flex gap-3 mt-3 overflow-x-auto no-scrollbar">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => showImage(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === activeImage}
              className={`shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-surface-low ring-2 transition ${i === activeImage ? 'ring-primary' : 'ring-transparent hover:ring-outline-variant'}`}
            >
              <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }} />
            </button>
          ))}
        </div>
      )}
      </div>

      <div className="px-4 pt-5 lg:px-0 lg:pt-0 space-y-4 lg:space-y-5">
        <div className="reveal reveal-fade-up">
          <div className="eyebrow flex flex-wrap items-center gap-x-1">
            {p.vendor?.businessName && <span>{p.vendor.businessName} ·</span>}
            <Link to={categoryPath({ name: p.category })} className="hover:text-primary">{p.category}</Link>
            {p.subcategory && (
              <>
                <span aria-hidden="true">›</span>
                <Link to={categoryPath({ name: p.category }, { name: p.subcategory })} className="hover:text-primary">{p.subcategory}</Link>
              </>
            )}
          </div>
          {/* Product names read in ink (page titles elsewhere keep the brand blue). */}
          <h1 className="mt-1 text-headline-lg lg:text-[2rem] font-bold text-on-surface leading-tight">{p.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            {typeof p.rating === 'number' && p.rating > 0 ? (
              <>
                <div className="flex items-center gap-0.5 text-secondary">
                  {[1,2,3,4,5].map((s) => (
                    <Icon key={s} name="star" fill={s <= Math.round(p.rating)} className="text-[16px]" />
                  ))}
                </div>
                <a href="#reviews" className="text-label-md text-on-surface-variant hover:text-primary">
                  {p.rating.toFixed(1)}{typeof p.reviewCount === 'number' && p.reviewCount > 0 ? ` (${p.reviewCount} review${p.reviewCount === 1 ? '' : 's'})` : ''}
                </a>
              </>
            ) : (
              <a href="#reviews" className="text-label-md text-on-surface-variant hover:text-primary">
                No reviews yet — be the first
              </a>
            )}
          </div>
          {/* Price block. Amazon/Temu style: when there's a deal,
              the previous price is shown struck-through next to the
              current one and a percent-off chip turns the saving into
              a single scannable token. Without a deal we keep the
              baseline quiet so non-deal products don't get visual
              noise above the fold. Compare-at values come from the
              server's `compareAtPriceCents` which the admin/partner
              apps set in the deal-price workflow. */}
          <div className="mt-3 flex items-baseline gap-2 flex-wrap">
            <span className={`text-[28px] leading-8 font-extrabold tracking-tight ${p.compareAtPriceCents > p.priceCents ? 'text-sale' : 'text-on-surface'}`}>
              {formatPrice(p.priceCents, currency)}
            </span>
            {p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents && (
              <>
                <span className="text-on-surface-variant line-through text-base">
                  {formatPrice(p.compareAtPriceCents, currency)}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-sale text-white text-label-md font-black">
                  -{Math.round((1 - p.priceCents / p.compareAtPriceCents) * 100)}%
                </span>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-label-md font-semibold">
            {p.stock > 0 ? (
              <span className={p.stock <= 5 ? 'text-amber-600' : 'text-tertiary'}>
                <Icon name={p.stock <= 5 ? 'local_fire_department' : 'check_circle'} className="text-[16px] align-text-bottom" fill />{' '}
                {p.stock <= 5 ? `Only ${p.stock} left — order soon` : 'In stock'}
              </span>
            ) : (
              <span className="text-error">Out of stock</span>
            )}
            <span className="text-on-surface-variant font-medium">
              · {p.priceCents >= 5000 ? 'Free delivery' : 'Free delivery over $50'}
            </span>
          </div>
        </div>

        {hasVariants && (
          <div className="reveal reveal-slide-left" style={{ "--reveal-delay": "80ms" }}>
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
          <div className="reveal reveal-slide-left" style={{ "--reveal-delay": "160ms" }}>
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

            {/* The sticky bottom bar is the single add-to-cart action;
                it reflects the picked colour/size. */}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-label-md text-on-surface-variant">Quantity</div>
          <div className="flex items-center gap-3 bg-surface-low rounded-full px-3 py-1.5">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-7 h-7 rounded-full bg-white shadow-card flex items-center justify-center disabled:opacity-50"
            >
              <Icon name="remove" className="text-[16px]" />
            </button>
            <span className="font-semibold w-6 text-center">{qty}</span>
            <button
              type="button"
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

        <div className="hidden lg:grid grid-cols-2 gap-3">{ctaButtons}</div>

        <div className="reveal reveal-flip"><ProductDescriptionTabs product={p} onChanged={() => refetch()} /></div>

        {/* Delivery card — expanded with cash-on-delivery (a Yobou
            selling point) and a stock urgency hint when stock is
            running low. Temu and Amazon both surface "Only N left,
            order soon" right above the variant picker; we put it on
            the delivery line so the value-prop stays consistent. */}
        <div className="reveal reveal-slide-right card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-tertiary-container/20 flex items-center justify-center">
            <Icon name="local_shipping" className="text-tertiary" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">
              {p.priceCents * qty >= 5000 ? 'Free delivery' : `Delivery ${formatPrice(499, currency)}`}
            </div>
            <div className="text-label-md text-on-surface-variant">Arrives in 2–4 business days</div>
            {/* Stock urgency — appears only when stock is low (
                either the variant's, or the product's if no
                variants). Keeps the value-prop honest without
                inventing urgency the data doesn't support. */}
            {showStockUrgency && (
              <div className="mt-1 text-label-md text-error font-semibold flex items-center gap-1">
                <Icon name="bolt" className="text-[14px]" />
                Only {stockForUrgency} left — order soon
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="chip bg-secondary-container text-on-secondary-container text-label-md font-semibold">
              <Icon name="payments" className="text-[14px]" />
              Cash on delivery
            </span>
          </div>
        </div>

        {/* Trust badges row — a thin strip under the delivery card
            that gives the shopper three single-glance guarantees.
            Amazon-style "Secure transaction / Returns / Authentic"
            chips; Temu-style "All Yobou purchases are protected".
            Pure presentational — no API calls. Sub-text uses
            text-label-md (12px) rather than 11px so it stays legible
            on VoiceOver/Narrator at 200% magnification and meets
            WCAG-AA contrast against surface-low without a separate
            fontweight bump. */}
        <div className="reveal-stagger stagger-pop grid grid-cols-3 gap-2 text-center" style={{ "--stagger-step": "100ms" }}>
          <div className="card p-3 flex flex-col items-center gap-1">
            <Icon name="lock" className="text-primary text-[20px]" />
            <span className="text-label-md font-semibold">Secure checkout</span>
            <span className="text-label-md text-on-surface-variant">256-bit SSL</span>
          </div>
          <div className="card p-3 flex flex-col items-center gap-1">
            <Icon name="assignment_return" className="text-primary text-[20px]" />
            <span className="text-label-md font-semibold">Free returns</span>
            <span className="text-label-md text-on-surface-variant">Within 30 days</span>
          </div>
          <div className="card p-3 flex flex-col items-center gap-1">
            <Icon name="verified" className="text-primary text-[20px]" />
            <span className="text-label-md font-semibold">Authentic</span>
            <span className="text-label-md text-on-surface-variant">Verified sellers</span>
          </div>
        </div>

        {err && <div className="text-error text-sm">{err}</div>}

        {/* Vendor mini-card. Amazon surfaces the seller under
            "Featured from our brands" / "Visit the [store] Store";
            Temu shows the shipper with a Verified chip. We don't
            have a follow/storefront screen yet, so this card
            renders as informational rather than actionable — just
            the business name + a Verified chip so the shopper sees
            who they're buying from. The link doesn't navigate
            anywhere; it’s a transparent "trust anchor" pattern that
            Amazon uses for its brand storefront widgets. */}
        {p.vendor && (
          <div className="reveal reveal-tilt card p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary-container/40 flex items-center justify-center">
              <Icon name="storefront" className="text-primary text-[24px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{p.vendor.businessName || 'Yobou seller'}</div>
              <div className="text-label-md text-on-surface-variant flex items-center gap-1">
                <Icon name="verified" className="text-tertiary text-[14px]" />
                Verified seller
              </div>
            </div>
            <Link
              to={`/categories`}
              className="text-label-md text-primary font-semibold whitespace-nowrap"
              aria-label="Browse product categories"
            >
              Browse categories →
            </Link>
          </div>
        )}

        {/* Shipping / Returns / Payment accordions. The single
            delivery card above already covers headline delivery
            cost; these <details> elements expand on demand for the
            edge-case questions. Amazon and Temu both keep these
            answers one tap away — not in a separate Help screen —
            because the abandonment cart rate is heavily influenced
            by what the shopper can learn at the moment of purchase.
            Pure HTML <details>/<summary> — no portal/aria-expanded
            state machinery needed. */}
        <div className="reveal reveal-wipe card divide-y divide-outline-variant/30">
          <details className="group p-4">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <span className="flex items-center gap-2 font-semibold text-sm">
                <Icon name="local_shipping" className="text-primary text-[18px]" />
                Shipping
              </span>
              <Icon name="expand_more" className="text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 text-sm text-on-surface-variant space-y-1.5 pl-7">
              <div>• Standard delivery 2–4 business days</div>
              <div>• Free delivery on orders over {formatPrice(5000, currency)}</div>
              <div>• {p.priceCents * qty >= 5000 ? 'Your order qualifies for FREE delivery' : `Add ${formatPrice(5000 - p.priceCents * qty, currency)} more to qualify for FREE delivery`}</div>
              <div>• Tracking updated by SMS and in-app notifications</div>
            </div>
          </details>
          <details className="group p-4">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <span className="flex items-center gap-2 font-semibold text-sm">
                <Icon name="assignment_return" className="text-primary text-[18px]" />
                Returns
              </span>
              <Icon name="expand_more" className="text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 text-sm text-on-surface-variant space-y-1.5 pl-7">
              <div>• Free returns within 30 days of delivery</div>
              <div>• Items must be unworn/unused with original packaging</div>
              <div>• Refund processed within 5 business days of receipt</div>
              <div>• Start a return from Profile → Orders → Request return</div>
            </div>
          </details>
          <details className="group p-4">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <span className="flex items-center gap-2 font-semibold text-sm">
                <Icon name="credit_card" className="text-primary text-[18px]" />
                Payment options
              </span>
              <Icon name="expand_more" className="text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 text-sm text-on-surface-variant space-y-1.5 pl-7">
              <div>• Credit & debit cards (Visa, Mastercard, Amex)</div>
              <div>• Cash on delivery (no extra fee)</div>
              <div>• Secure checkout via 256-bit SSL + 3-D Secure</div>
              <div>• Saved cards available from step 2 of checkout</div>
            </div>
          </details>
        </div>
      </div>
      </div>

      <div className="px-4 pt-4 lg:px-0 lg:pt-12">
        <div className="reveal reveal-fade-up"><RelatedProducts productId={p.id} onAdd={add} /></div>
      </div>

      {/* Sticky CTA. Layered with `z-40` so it sits ABOVE the bottom
          nav (which is `z-30` in MobileShell) — without this, the nav
          covers the CTA's hit area even though both are fixed to
          `bottom-0`, and the shopper's tap on Add-to-Cart lands on
          the Home/Categories tab underneath, feeling like the page
          "refreshes". Safe-area bottom padding is added inline so the
          CTA clears the iOS/Android gesture pill and the bottom nav
          never overlaps the buttons either. type="button" is set
          explicitly on both buttons because the HTML default of
          `type="submit"` will, in some Android WebView builds, submit
          the page even without an enclosing <form> — the symptom is
          identical from the user's POV ("nothing happened, page
          refreshed"). Forcing the type locks the click into our React
          handler which then calls add() / buy() and navigates to
          /cart or /checkout/shipping as expected. */}
      <div
        className="lg:hidden fixed bottom-0 inset-x-0 px-4 pt-3 glass border-t border-outline-variant/50 shadow-nav z-40"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-screen-md mx-auto grid grid-cols-2 gap-3">
          {ctaButtons}
        </div>
      </div>
    </div>
  );
}

function humanizeCartError(code) {
  switch (code) {
    case 'UNAUTHENTICATED': return 'Couldn\u2019t start a guest session \u2014 please try again in a moment.';
    case 'INSUFFICIENT_STOCK': return 'Not enough stock for the requested quantity.';
    case 'PRODUCT_NOT_AVAILABLE': return 'This product is no longer available.';
    case 'INVALID_VARIANT': return 'That color/size combination is no longer available.';
    default: return 'Could not add to cart.';
  }
}
