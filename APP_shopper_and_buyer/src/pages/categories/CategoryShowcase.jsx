// Home-style merchandising blocks for the category pages. Every block
// is data-driven from the category's live products and hides itself
// when it has nothing real to show (no invented discounts or urgency).
//
//   Spotlight      — auto-rotating wide banners of the best deals
//   FlashShelf     — products flagged showOnFlashDeals, with countdown
//   DepartmentShelf— one rail per subcategory ("Audio & Headphones ›")
//   priceBands     — quick price filters derived from what's listed
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import CountdownTimer from '../../components/CountdownTimer';
import ProductRow from '../home/ProductRow';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';
import { useStore } from '../../store';
import { categoryPath } from '../../lib/categoryTheme';

// Fixed card width: a lone card in a rail would otherwise stretch to its
// image's intrinsic size.
export const RAIL_CARD = 'w-[170px] sm:w-[200px] shrink-0';

export const isDeal = (p) => typeof p.compareAtPriceCents === 'number' && p.compareAtPriceCents > (p.priceCents || 0);
// A deal the seller/admin allows in deal sections (Product.showOnDeals).
export const isShownDeal = (p) => isDeal(p) && p.showOnDeals !== false;

/**
 * Is product `p` on this category (optionally department) page — by its
 * own category/subcategory, or because it is pinned there?
 */
export function onPage(p, category, sub) {
  if (p.category === category && (!sub || p.subcategory === sub)) return true;
  return (p.extraCategories || []).some((pin) => pin.name === category && (!sub || pin.subcategory === sub));
}
export const dealPercent = (p) => Math.round(((p.compareAtPriceCents - p.priceCents) / p.compareAtPriceCents) * 100);

// ---------------------------------------------------------------------------

export function Spotlight({ products, theme, title = 'Top deals' }) {
  const currency = useStore((s) => s.user?.currency || 'USD');
  const ref = useRef(null);
  const paused = useRef(false);
  const [index, setIndex] = useState(0);
  const count = products.length;

  // Auto-advance every 5 s; pauses while the shopper touches it and
  // when they prefer reduced motion.
  useEffect(() => {
    if (count < 2) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const id = setInterval(() => {
      const el = ref.current;
      if (!el || paused.current) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % count;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, 5000);
    return () => clearInterval(id);
  }, [count]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  if (count === 0) return null;
  return (
    <section aria-label={title} className="-mx-4">
      <div
        ref={ref}
        className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth"
        onPointerDown={() => { paused.current = true; }}
        onPointerUp={() => { setTimeout(() => { paused.current = false; }, 4000); }}
        aria-roledescription="carousel"
      >
        {products.map((p, i) => {
          const deal = isDeal(p);
          return (
            <div key={p.id} className="snap-center shrink-0 w-full px-4" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`}>
              <Link to={`/product/${p.id}`} className={`relative flex items-stretch overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradient} text-white min-h-[176px] shadow-lg group`}>
                <div className="relative z-10 flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                      <Icon name={deal ? 'local_offer' : 'auto_awesome'} fill className="text-[13px]" />
                      {deal ? title : p.showOnCategorySpotlight ? 'Featured' : 'Just in'}
                    </span>
                    <h3 className="mt-2 text-title-lg font-bold leading-tight line-clamp-2 text-white">{p.name}</h3>
                    {p.subcategory && <p className="text-label-md text-white/80 mt-0.5">{p.subcategory}</p>}
                  </div>
                  <div className="mt-3 flex items-end gap-2 flex-wrap">
                    <span className="text-headline-md font-extrabold leading-none">{formatPrice(p.priceCents, currency)}</span>
                    {deal && <span className="text-sm line-through text-white/70">{formatPrice(p.compareAtPriceCents, currency)}</span>}
                  </div>
                  <span className="mt-3 self-start inline-flex items-center gap-1 rounded-full bg-white text-on-surface px-3.5 py-1.5 text-label-md font-bold">
                    Shop now <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <div className="relative w-[42%] shrink-0">
                  <img src={productImage(p)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  {deal && (
                    <span className="absolute top-3 right-3 w-14 h-14 rounded-full bg-sale text-white font-extrabold text-sm flex flex-col items-center justify-center shadow-lg rotate-12 leading-none">
                      -{dealPercent(p)}%<span className="text-[9px] font-bold mt-0.5">OFF</span>
                    </span>
                  )}
                </div>
              </Link>
            </div>
          );
        })}
      </div>
      {count > 1 && (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
          {products.map((p, i) => (
            <span key={p.id} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-1.5 bg-outline-variant'}`} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function FlashShelf({ products, onAdd }) {
  if (products.length < 2) return null; // a one-card "rail" isn't a rail
  return (
    <section aria-labelledby="flash-h" className="rounded-3xl bg-gradient-to-br from-sale/10 via-secondary/10 to-transparent ring-1 ring-sale/15 pt-4 pb-2 -mx-1 px-1">
      <div className="px-3 flex items-center justify-between gap-2 mb-3">
        <h2 id="flash-h" className="text-title-lg font-bold flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-sale text-white flex items-center justify-center">
            <Icon name="bolt" fill className="text-[20px]" />
          </span>
          Flash deals
        </h2>
        <CountdownTimer prefix="Ends in" />
      </div>
      <div className="px-3">
        <ProductRow products={products} onAdd={onAdd} cardWidth={RAIL_CARD} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

export function DepartmentShelf({ category, sub, products, theme, onAdd }) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={`shelf-${sub.slug}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${theme.tile}`}>
          <Icon name={sub.icon || theme.icon} className="text-[22px]" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 id={`shelf-${sub.slug}`} className="text-title-md font-bold truncate">{sub.name}</h2>
          {sub.description && <p className="text-label-sm text-on-surface-variant truncate">{sub.description}</p>}
        </div>
        <Link to={categoryPath(category, sub)} className="shrink-0 inline-flex items-center gap-0.5 text-sm text-primary font-semibold">
          See all <Icon name="chevron_right" className="text-[18px]" />
        </Link>
      </div>
      <ProductRow products={products} onAdd={onAdd} cardWidth={RAIL_CARD} />
    </section>
  );
}

// ---------------------------------------------------------------------------

const BANDS = [
  { key: 'u25', max: 2500 },
  { key: '25-50', min: 2500, max: 5000 },
  { key: '50-100', min: 5000, max: 10000 },
  { key: '100-250', min: 10000, max: 25000 },
  { key: '250-500', min: 25000, max: 50000 },
  { key: '500+', min: 50000 },
];

/** Price bands that actually contain products in this scope. */
export function priceBands(products, currency) {
  const fmt = (c) => formatPrice(c, currency).replace(/[.,]00(?=\D*$)/, '');
  return BANDS
    .map((b) => ({
      ...b,
      count: products.filter((p) => (b.min == null || p.priceCents >= b.min) && (b.max == null || p.priceCents < b.max)).length,
      label: b.min == null ? `Under ${fmt(b.max)}` : b.max == null ? `${fmt(b.min)}+` : `${fmt(b.min)} – ${fmt(b.max)}`,
    }))
    .filter((b) => b.count > 0);
}
