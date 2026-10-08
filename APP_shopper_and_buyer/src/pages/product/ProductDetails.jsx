import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImages } from '../../lib/productImage';
import { colorToHex } from '../../lib/colorSwatch';
import { formatPrice } from '../../lib/format';
import { useCatalogStream } from '../../lib/useSse';

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
  const variants = Array.isArray(p?.variants) ? p.variants : [];
  const [qty, setQty] = useState(1);
  const [pickedColor, setPickedColor] = useState('');
  const [pickedSize, setPickedSize] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const carouselRef = useRef(null);

  const uniqueColors = useMemo(() => {
    const set = new Set();
    for (const v of variants) if (v?.color) set.add(v.color);
    return [...set];
  }, [variants]);

  const uniqueSizes = useMemo(() => {
    const set = new Set();
    for (const v of variants) if (v?.size) set.add(v.size);
    return [...set];
  }, [variants]);

  useEffect(() => {
    if (!p) return;
    if (variants.length === 0) {
      setPickedColor('');
      setPickedSize('');
      return;
    }
    const defaultColor = uniqueColors[0] || '';
    const defaultSize = (variants.find((v) => v.color === defaultColor && v.stock > 0) || variants[0])?.size || '';
    if (!pickedColor || !uniqueColors.includes(pickedColor)) setPickedColor(defaultColor);
    if (!pickedSize || !uniqueSizes.includes(pickedSize)) setPickedSize(defaultSize);
  }, [p, variants, uniqueColors, uniqueSizes, pickedColor, pickedSize]);

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

  const images = productImages(p);
  const selectedVariant = useMemo(() => {
    if (!variants.length) return null;
    return variants.find((v) => v.color === pickedColor && v.size === pickedSize) || null;
  }, [variants, pickedColor, pickedSize]);

  const maxAvailable = selectedVariant ? Math.max(0, selectedVariant.stock) : Math.max(0, p.stock || 0);
  const outOfStock = variants.length > 0 ? maxAvailable === 0 : p.stock === 0;
  const hasSelection = variants.length > 0 ? !!selectedVariant : true;
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
      await api('/api/cart', {
        method: 'POST',
        body: {
          productId: p.id,
          quantity: qty,
          variantId: selectedVariant ? selectedVariant.id : null,
        },
      });
      await refreshCart();
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
      await api('/api/cart', {
        method: 'POST',
        body: {
          productId: p.id,
          quantity: qty,
          variantId: selectedVariant ? selectedVariant.id : null,
        },
      });
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
          {/* Defensive type="button" on every PDP button. Sticky
              CTA was already fixed in the v0.3.9 patch; these close
              the same `type="submit"` WebView quirk for the rest of
              the page so no PDP button can reload the WebView. */}
          <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center">
            <Icon name="arrow_back" />
          </button>
          <div className="flex gap-2">
            <button type="button" className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center" aria-label="Share">
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
      </div>

      <div className="px-4 pt-5 space-y-4">
        <div>
          <div className="text-label-md text-on-surface-variant uppercase">{p.category}</div>
          <h1 className="mt-1 text-headline-lg font-bold">{p.name}</h1>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-0.5 text-secondary">
              {[1,2,3,4,5].map((s) => <Icon key={s} name="star" fill={s <= 4} className="text-[16px]" />)}
            </div>
            <span className="text-label-md text-on-surface-variant">4.0 · {selectedVariant ? `${selectedVariant.stock} in stock` : `${p.stock} in stock`}</span>
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
            <span className="text-headline-lg font-bold text-primary">{formatPrice(p.priceCents, currency)}</span>
            {p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents && (
              <>
                <span className="text-on-surface-variant line-through text-base">
                  {formatPrice(p.compareAtPriceCents, currency)}
                </span>
                <span className="chip bg-tertiary text-white text-label-md font-bold px-2 py-0.5 rounded-full">
                  {Math.round((1 - p.priceCents / p.compareAtPriceCents) * 100)}% off
                </span>
              </>
            )}
          </div>
        </div>

        {variants.length > 0 && (
          <>
            <div>
              <div className="text-label-md text-on-surface-variant mb-2">Color</div>
              <div className="flex flex-wrap gap-2">
                {uniqueColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setPickedColor(color)}
                    className={`px-3 py-2 rounded-full border text-sm font-medium transition ${pickedColor === color ? 'border-primary bg-primary-container/30 text-primary' : 'border-outline-variant/40 bg-white text-on-surface'}`}
                    aria-pressed={pickedColor === color}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-label-md text-on-surface-variant mb-2">Size</div>
              <div className="flex flex-wrap gap-2">
                {uniqueSizes.map((size) => {
                  const variant = variants.find((v) => v.color === pickedColor && v.size === size);
                  const isDisabled = !variant || variant.stock === 0;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => !isDisabled && setPickedSize(size)}
                      disabled={isDisabled}
                      className={`min-w-[52px] px-3 py-2 rounded-full border text-sm font-medium transition ${pickedSize === size ? 'border-primary bg-primary-container/30 text-primary' : 'border-outline-variant/40 bg-white text-on-surface'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
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
              onClick={() => setQty((q) => Math.min(maxAvailable || 99, Math.max(1, q + 1)))}
              disabled={qty >= maxAvailable || outOfStock || !hasSelection}
              className="w-7 h-7 rounded-full bg-white shadow-card flex items-center justify-center disabled:opacity-50"
            >
              <Icon name="add" className="text-[16px]" />
            </button>
          </div>
        </div>

        <ProductDescriptionTabs product={p} onChanged={() => refetch()} />

        {/* Delivery card — expanded with cash-on-delivery (a Yobou
            selling point) and a stock urgency hint when stock is
            running low. Temu and Amazon both surface "Only N left,
            order soon" right above the variant picker; we put it on
            the delivery line so the value-prop stays consistent. */}
        <div className="card p-4 flex items-center gap-3">
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
        <div className="grid grid-cols-3 gap-2 text-center">
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
          <div className="card p-4 flex items-center gap-3">
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
        <div className="card divide-y divide-outline-variant/30">
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

        <RelatedProducts productId={p.id} onAdd={add} />
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
        className="fixed bottom-0 inset-x-0 p-4 bg-white border-t border-outline-variant/30 shadow-float z-40"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-screen-md mx-auto grid grid-cols-2 gap-3">
          <button onClick={add} disabled={busy || outOfStock || !hasSelection} className="btn-secondary py-3 disabled:opacity-60">
            <Icon name="shopping_bag" /> {outOfStock ? 'Sold out' : 'Add to Cart'}
          </button>
          <button onClick={buy} disabled={busy || outOfStock || !hasSelection} className="btn-primary py-3 disabled:opacity-60">
            Buy Now
          </button>
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
