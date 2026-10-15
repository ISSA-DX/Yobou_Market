// Category / subcategory page — one uniform, Home-style template for
// every department in the catalogue.
//
// Routes: /categories/:slug and /categories/:slug/:sub
// Data:   GET /api/products/categories/:slug       → content + subcategories
//         GET /api/products?category=…&pageSize=60 → merchandising (rails)
//         GET /api/products?category=&subcategory=&q=&sort=&inStock=&minPrice=&maxPrice=&page=
//                                                  → the filterable grid
//
// Layout:
//   1. Hero — breadcrumb, title, tagline, stats, a fan of real products
//   2. Sticky department bar
//   3. Spotlight carousel (best deals) · Flash deals with countdown
//   4. Category: one shelf per department + New arrivals
//      Subcategory: the grid first, then "More in <category>"
//   5. Full grid — search · sort · in stock · price bands · load more
//   6. Shopping guide (About / Buying guide / FAQs) · More categories
//
// Every block is driven by live products and hides itself when empty.
// Copy is admin-editable (Admin → Categories); colours come from
// lib/categoryTheme.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import ProductRow from '../home/ProductRow';
import { useCatalogStream } from '../../lib/useSse';
import { useProductLiveSync } from '../../lib/useProductLiveSync';
import { useApi } from '../../useApi.jsx';
import { toast } from '../../lib/toast';
import { productImage } from '../../lib/productImage';
import { themeFor, categoryPath } from '../../lib/categoryTheme';
import { plural, countLabel } from '../../lib/categoryFormat';
import { Spotlight, FlashShelf, DepartmentShelf, priceBands, isDeal, isShownDeal, onPage, dealPercent, RAIL_CARD } from './CategoryShowcase';

const SORTS = [
  { key: 'featured', label: 'Featured' },
  { key: 'newest', label: 'Newest' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'name-asc', label: 'Name: A–Z' },
];
const PAGE_SIZE = 24;

async function addToCart(p) {
  try {
    await useStore.getState().ensureGuestSession();
    await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
    await useStore.getState().refreshCartCount();
    toast.addedToCart(p);
  } catch (e) {
    toast.error(e?.data?.error || 'Could not add to cart');
  }
}

const byDiscount = (a, b) => dealPercent(b) - dealPercent(a);

export default function CategoryDetail() {
  const { slug, sub: subSlug } = useParams();
  const navigate = useNavigate();
  const meta = useApi(`/api/products/categories/${encodeURIComponent(slug)}`);
  useProductLiveSync(meta.refetch, { alsoCategories: true });
  const gridRef = useRef(null);

  // Ignore the previous category's payload while the next one loads.
  const loaded = meta.data?.category;
  const category = loaded && (loaded.slug === slug || slug.toLowerCase() === loaded.name.toLowerCase()) ? loaded : null;
  const related = category ? meta.data?.related || [] : [];
  const subs = category?.subcategories || [];
  const activeSub = subSlug ? subs.find((s) => s.slug === subSlug) || null : null;
  const t = themeFor(category || { slug });

  // One category-wide fetch feeds every rail (shelves, spotlight,
  // flash, "more in"); the grid below pages through the server itself.
  const shelfApi = useApi(
    category ? `/api/products?${new URLSearchParams({ category: category.name, sort: 'newest', pageSize: '60' })}` : '',
    { skip: !category },
  );
  useProductLiveSync(shelfApi.refetch);
  const catProducts = category && shelfApi.data ? shelfApi.data.products || [] : [];
  const scope = activeSub ? catProducts.filter((p) => onPage(p, category.name, activeSub.name)) : catProducts;

  const merch = useMemo(() => {
    const inStock = scope.filter((p) => p.stock > 0);
    const deals = inStock.filter(isShownDeal).sort(byDiscount);
    // Spotlight: what admins/sellers chose (Category spotlight), then the
    // best deals, then the newest — so the banner is never empty.
    const chosen = inStock.filter((p) => p.showOnCategorySpotlight);
    const spotlight = [...chosen, ...deals.filter((p) => !p.showOnCategorySpotlight)]
      .slice(0, 5);
    if (spotlight.length === 0) spotlight.push(...inStock.slice(0, 5));
    const shown = new Set(spotlight.map((p) => p.id));
    return {
      peek: [...spotlight, ...inStock.filter((p) => !shown.has(p.id))].slice(0, 3),
      spotlight,
      // Flash and New skip what the spotlight already shows.
      flash: inStock.filter((p) => p.showOnFlashDeals && !shown.has(p.id)).slice(0, 10),
      fresh: inStock.filter((p) => p.showOnNewArrivals && !shown.has(p.id)).slice(0, 10),
    };
  }, [scope]);

  // New category → start at the top (the router keeps scroll position).
  useEffect(() => { window.scrollTo({ top: 0 }); }, [slug, subSlug]);

  // Unknown subcategory slug (renamed or hidden) → category page.
  useEffect(() => {
    if (category && subSlug && !activeSub) navigate(categoryPath(category), { replace: true });
  }, [category, subSlug, activeSub, navigate]);

  if (meta.error && !meta.data) {
    const notFound = meta.error?.status === 404;
    return (
      <div className="px-4 py-16 text-center text-on-surface-variant">
        <div className="w-20 h-20 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-4">
          <Icon name={notFound ? 'travel_explore' : 'cloud_off'} className="text-[36px]" />
        </div>
        <p className="text-title-md font-medium text-on-surface">{notFound ? 'This category isn’t available' : 'Could not load this category'}</p>
        <p className="text-sm mt-1">{notFound ? 'It may have been renamed or retired.' : 'Check your connection and try again.'}</p>
        <div className="mt-4 flex justify-center gap-2">
          {!notFound && <button type="button" onClick={meta.refetch} className="btn-primary px-5 py-2">Try again</button>}
          <Link to="/categories" className="btn-secondary px-5 py-2">All categories</Link>
        </div>
      </div>
    );
  }

  const shelves = !activeSub
    ? subs.map((s) => ({ sub: s, products: catProducts.filter((p) => onPage(p, category.name, s.name)) })).filter((x) => x.products.length > 0)
    : [];
  const moreInCategory = activeSub ? catProducts.filter((p) => !onPage(p, category.name, activeSub.name) && p.stock > 0).slice(0, 12) : [];
  const hasProducts = scope.length > 0;

  return (
    <div className="pb-8">
      <Hero category={category} activeSub={activeSub} theme={t} slug={slug} peek={merch.peek} />

      {subs.length > 0 && <DepartmentBar category={category} subs={subs} activeSub={activeSub} theme={t} />}

      <div className="px-4 pt-4 space-y-8">
        {hasProducts && <Spotlight products={merch.spotlight} theme={t} title={activeSub ? `${activeSub.name} deals` : 'Top deals'} />}
        {hasProducts && <FlashShelf products={merch.flash} onAdd={addToCart} />}

        {/* Category level: browse department by department. */}
        {shelves.map(({ sub, products }) => (
          <DepartmentShelf key={sub.slug} category={category} sub={sub} products={products} theme={t} onAdd={addToCart} />
        ))}
        {!activeSub && merch.fresh.length >= 4 && (
          <ProductRow title={`New in ${category.name}`} icon="new_releases" products={merch.fresh} onAdd={addToCart} cardWidth={RAIL_CARD} />
        )}

        <div ref={gridRef} className="scroll-mt-16">
          {category
            ? <ProductsSection key={`${category.name}/${activeSub?.name || ''}`} category={category} activeSub={activeSub} related={related} scope={scope} />
            : <GridSkeleton />}
        </div>

        {moreInCategory.length > 0 && (
          <ProductRow title={`More in ${category.name}`} icon="explore" actionTo={categoryPath(category)} products={moreInCategory} onAdd={addToCart} cardWidth={RAIL_CARD} />
        )}

        {category && <GuidePanel category={category} activeSub={activeSub} theme={t} />}
        {related.length > 0 && <RelatedSection related={related} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Hero({ category, activeSub, theme, slug, peek }) {
  const title = activeSub?.name || category?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const subtitle = activeSub ? activeSub.description : category?.tagline;
  const count = activeSub ? activeSub.productCount : category?.productCount;
  const deals = peek.filter(isDeal).length;
  const stats = category
    ? [count > 0 ? plural(count, 'item') : 'Coming soon', !activeSub && category.subcategories.length > 0 ? plural(category.subcategories.length, 'department') : null].filter(Boolean)
    : [];

  return (
    <header className={`relative overflow-hidden bg-gradient-to-br ${theme.gradient} text-white`}>
      {/* Decorative depth */}
      <span className="absolute -top-16 -left-10 w-48 h-48 rounded-full bg-white/10" aria-hidden="true" />
      <span className="absolute -bottom-20 right-1/3 w-56 h-56 rounded-full bg-black/10" aria-hidden="true" />

      <div className="relative z-10 px-4 pt-3 pb-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-label-md text-white/80 mb-3 min-w-0">
          <Link to={activeSub ? categoryPath(category) : `/categories${category ? `?c=${category.slug}` : ''}`} className="p-2 -ml-2 rounded-full hover:bg-white/20 transition-colors shrink-0" aria-label="Back">
            <Icon name="arrow_back" className="text-[22px] text-white" />
          </Link>
          <Link to="/categories" className="hover:text-white shrink-0">Categories</Link>
          {category && (
            <>
              <Icon name="chevron_right" className="text-[16px] shrink-0" />
              {activeSub
                ? <Link to={categoryPath(category)} className="hover:text-white truncate">{category.name}</Link>
                : <span className="text-white font-medium truncate" aria-current="page">{category.name}</span>}
            </>
          )}
          {activeSub && (
            <>
              <Icon name="chevron_right" className="text-[16px] shrink-0" />
              <span className="text-white font-medium truncate" aria-current="page">{activeSub.name}</span>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="reveal reveal-pop inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-sm pl-1 pr-3 py-1 mb-2">
              <span className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center">
                <Icon name={activeSub?.icon || theme.icon} className="text-[17px] text-white" />
              </span>
              <span className="text-label-md font-semibold">{activeSub ? category?.name : 'Department store'}</span>
            </div>
            {/* text-white overrides the global brand-blue h1 rule. */}
            <h1 className="reveal reveal-slide-right text-headline-md sm:text-headline-lg font-extrabold text-white leading-tight" style={{ '--reveal-delay': '80ms' }}>{title}</h1>
            {subtitle
              ? <p className="text-sm text-white/90 mt-1 line-clamp-2">{subtitle}</p>
              : !category && <div className="h-4 w-48 mt-2 rounded bg-white/25 animate-pulse" />}

            {stats.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stats.map((s) => (
                  <span key={s} className="rounded-full bg-white/15 px-2.5 py-1 text-label-sm font-semibold">{s}</span>
                ))}
                {deals > 0 && (
                  <span className="rounded-full bg-secondary text-on-secondary px-2.5 py-1 text-label-sm font-bold inline-flex items-center gap-1">
                    <Icon name="local_offer" fill className="text-[13px]" /> Deals inside
                  </span>
                )}
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-label-sm font-semibold inline-flex items-center gap-1">
                  <Icon name="verified" className="text-[13px]" /> Approved sellers
                </span>
              </div>
            )}
          </div>

          {/* A fan of real products from this department. */}
          {peek.length > 0 ? <ProductFan products={peek} /> : (
            <Icon name={activeSub?.icon || theme.icon} className="anim-float text-[96px] opacity-25 shrink-0" />
          )}
        </div>
      </div>
    </header>
  );
}

function ProductFan({ products }) {
  const poses = ['-rotate-12 -translate-x-6 translate-y-2', 'rotate-0 z-10 -translate-y-1', 'rotate-12 translate-x-6 translate-y-2'];
  const order = products.length === 1 ? [1] : products.length === 2 ? [0, 2] : [0, 1, 2];
  return (
    <div className="relative w-[120px] h-[112px] shrink-0 mr-2" aria-hidden="true">
      {products.slice(0, 3).map((p, i) => (
        <img
          key={p.id}
          src={productImage(p)}
          alt=""
          className={`absolute left-1/2 top-1/2 -ml-[42px] -mt-[42px] w-[84px] h-[84px] object-cover rounded-2xl ring-[3px] ring-white shadow-2xl transition-transform ${poses[order[i]]}`}
        />
      ))}
    </div>
  );
}

function DepartmentBar({ category, subs, activeSub, theme }) {
  const scroller = useRef(null);
  const activeRef = useRef(null);
  useEffect(() => {
    const el = activeRef.current;
    const box = scroller.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [activeSub?.slug]);

  const items = [{ slug: null, name: 'All', icon: 'apps', productCount: category.productCount }, ...subs];
  return (
    <nav aria-label={`${category.name} departments`} className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-outline-variant/40">
      <div ref={scroller} className="flex gap-2 overflow-x-auto no-scrollbar px-4 py-2.5">
        {items.map((s) => {
          const active = s.slug ? activeSub?.slug === s.slug : !activeSub;
          return (
            <Link
              key={s.slug || 'all'}
              ref={active ? activeRef : undefined}
              to={s.slug ? categoryPath(category, s) : categoryPath(category)}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 inline-flex items-center gap-1.5 h-9 pl-1.5 pr-3 rounded-full text-sm font-medium border transition-colors ${
                active ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white border-outline-variant/60 text-on-surface hover:border-primary/50'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${active ? 'bg-white/20' : theme.tile}`}>
                <Icon name={s.icon || theme.icon} className="text-[15px]" />
              </span>
              {s.name}
              {s.productCount > 0 && <span className={`text-label-sm ${active ? 'text-white/80' : 'text-on-surface-variant'}`}>{s.productCount}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ProductsSection({ category, activeSub, related, scope }) {
  const currency = useStore((s) => s.user?.currency || 'USD');
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('featured');
  const [inStock, setInStock] = useState(false);
  const [band, setBand] = useState(null);
  const reqId = useRef(0);

  const bands = useMemo(() => priceBands(scope, currency), [scope, currency]);
  const activeBand = bands.find((b) => b.key === band) || null;

  // Debounce the in-category search so typing doesn't fire a request per key.
  useEffect(() => {
    const h = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(h);
  }, [input]);

  async function load(page = 1) {
    const my = ++reqId.current;
    page === 1 ? setLoading(true) : setLoadingMore(true);
    setError('');
    const params = new URLSearchParams({ category: category.name, sort, page: String(page), pageSize: String(PAGE_SIZE) });
    if (activeSub) params.set('subcategory', activeSub.name);
    if (q) params.set('q', q);
    if (inStock) params.set('inStock', 'true');
    if (activeBand?.min != null) params.set('minPrice', String(activeBand.min));
    if (activeBand?.max != null) params.set('maxPrice', String(activeBand.max - 1));
    try {
      const res = await api(`/api/products?${params}`);
      if (my !== reqId.current) return;
      setProducts((prev) => (page === 1 ? res.products || [] : [...prev, ...(res.products || [])]));
      setPagination(res.pagination || null);
    } catch {
      if (my !== reqId.current) return;
      setError('Could not load products.');
    } finally {
      if (my === reqId.current) { setLoading(false); setLoadingMore(false); }
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, [q, sort, inStock, band]);

  useCatalogStream((frame) => {
    if (!frame?.event) return;
    if (!['product_created', 'product_updated', 'product_deleted'].includes(frame.event)) return;
    if (frame.category && frame.category !== category.name) return;
    load(1);
  });

  function reset() { setInput(''); setInStock(false); setSort('featured'); setBand(null); }

  const scopeName = activeSub?.name || category.name;
  const total = pagination?.total ?? products.length;
  const filtered = Boolean(q || inStock || band || sort !== 'featured');
  const empty = !loading && !error && products.length === 0;
  const emptyScope = empty && !filtered; // nothing listed at all yet

  return (
    <section aria-labelledby="products-h" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{activeSub ? category.name : 'Browse everything'}</div>
          <h2 id="products-h" className="text-title-lg font-bold truncate">
            {activeSub ? `All ${activeSub.name}` : `All ${category.name}`}
          </h2>
        </div>
        {!loading && !emptyScope && (
          <span className="text-label-md text-on-surface-variant whitespace-nowrap">
            {products.length < total ? `${products.length} of ${total}` : plural(total, 'result')}
          </span>
        )}
      </div>

      {!emptyScope && (
        <>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
            <input
              className="input pl-10 pr-9 w-full h-11"
              placeholder={`Search in ${scopeName}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label={`Search in ${scopeName}`}
              type="search"
            />
            {input && (
              <button type="button" onClick={() => setInput('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant" aria-label="Clear search">
                <Icon name="close" className="text-[18px]" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
            <SortChip sort={sort} onChange={setSort} />
            <FilterChip active={inStock} onClick={() => setInStock((v) => !v)} icon="inventory" label="In stock" />
            {bands.length > 1 && <span className="w-px h-6 bg-outline-variant/60 shrink-0" aria-hidden="true" />}
            {bands.length > 1 && bands.map((b) => (
              <FilterChip key={b.key} active={band === b.key} onClick={() => setBand((cur) => (cur === b.key ? null : b.key))} icon="sell" label={b.label} />
            ))}
            {filtered && (
              <button type="button" onClick={reset} className="shrink-0 h-9 px-3 text-sm font-semibold text-primary">Reset</button>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => load(1)} className="text-primary font-semibold">Retry</button>
        </div>
      )}

      {loading && <GridSkeleton />}

      {!loading && !error && products.length > 0 && (
        <>
          <div className="reveal-stagger stagger-up grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 pt-1">
            {products.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
          </div>
          {pagination?.hasMore && (
            <div className="pt-2 flex flex-col items-center gap-2">
              <div className="w-40 h-1 rounded-full bg-surface-high overflow-hidden" aria-hidden="true">
                <div className="h-full bg-primary" style={{ width: `${Math.round((products.length / total) * 100)}%` }} />
              </div>
              <span className="text-label-sm text-on-surface-variant">Showing {products.length} of {total}</span>
              <button type="button" onClick={() => load((pagination.page || 1) + 1)} disabled={loadingMore} className="btn-secondary px-6 py-2.5">
                {loadingMore ? 'Loading…' : 'Show more'}
              </button>
            </div>
          )}
        </>
      )}

      {empty && !emptyScope && (
        <div className="card text-center py-10 px-6 text-on-surface-variant">
          <Icon name="search_off" className="text-[32px]" />
          <p className="font-medium text-on-surface mt-2">No matches{q ? ` for “${q}”` : ''}{activeBand ? ` at ${activeBand.label}` : ''}{inStock ? ' in stock' : ''}</p>
          <button type="button" onClick={reset} className="mt-2 text-sm text-primary font-semibold">Clear filters</button>
        </div>
      )}

      {emptyScope && <ComingSoon category={category} activeSub={activeSub} related={related} />}
    </section>
  );
}

function SortChip({ sort, onChange }) {
  const [open, setOpen] = useState(false);
  const label = SORTS.find((s) => s.key === sort)?.label || 'Featured';
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`h-9 pl-3 pr-2 rounded-full border inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap ${sort !== 'featured' ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-outline-variant/60'}`}
      >
        <Icon name="swap_vert" className="text-[18px]" />
        {label}
        <Icon name="expand_more" className="text-[18px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <ul className="fixed left-4 mt-1 w-56 bg-white rounded-xl shadow-elevation-3 border border-outline-variant/40 z-50 py-1" role="listbox" aria-label="Sort by">
            {SORTS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => { onChange(s.key); setOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-low flex items-center justify-between ${sort === s.key ? 'text-primary font-semibold' : ''}`}
                  role="option"
                  aria-selected={sort === s.key}
                >
                  {s.label}
                  {sort === s.key && <Icon name="check" className="text-[18px]" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 h-9 px-3 rounded-full border inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap ${active ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-outline-variant/60'}`}
    >
      <Icon name={active ? 'check' : icon} className="text-[18px]" />
      {label}
    </button>
  );
}

// Empty department → don't dead-end: show what IS available nearby.
function ComingSoon({ category, activeSub, related }) {
  const stocked = activeSub ? category.subcategories.filter((s) => s.productCount > 0 && s.slug !== activeSub.slug) : [];
  const stockedCats = stocked.length === 0 ? related.filter((c) => c.productCount > 0).slice(0, 6) : [];
  return (
    <div className="card p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-secondary/20 text-on-secondary mx-auto flex items-center justify-center mb-3">
        <Icon name="schedule" className="text-[32px]" />
      </div>
      <p className="text-title-md font-semibold">Coming soon to {activeSub?.name || category.name}</p>
      <p className="text-sm text-on-surface-variant mt-1 max-w-sm mx-auto">
        Approved sellers are stocking this department now. In the meantime, here’s what’s available nearby.
      </p>
      {(stocked.length > 0 || stockedCats.length > 0) && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {stocked.map((s) => (
            <Link key={s.slug} to={categoryPath(category, s)} className="chip hover:bg-primary/10 hover:text-primary">{s.name} · {s.productCount}</Link>
          ))}
          {stockedCats.map((c) => (
            <Link key={c.slug} to={categoryPath(c)} className="chip hover:bg-primary/10 hover:text-primary">{c.name} · {c.productCount}</Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
    </div>
  );
}

// About / Buying guide / FAQs in one tabbed panel — the editorial
// content is there when wanted without pushing products off-screen.
function GuidePanel({ category, activeSub, theme }) {
  const tabs = useMemo(() => [
    (category.description || activeSub?.description) && { key: 'about', label: 'About', icon: 'info' },
    category.guide?.length > 0 && { key: 'guide', label: 'Buying guide', icon: 'tips_and_updates' },
    category.faqs?.length > 0 && { key: 'faqs', label: 'FAQs', icon: 'quiz' },
  ].filter(Boolean), [category, activeSub]);
  const [tab, setTab] = useState(tabs[0]?.key);
  const [expanded, setExpanded] = useState(false);
  if (tabs.length === 0) return null;
  const current = tabs.some((x) => x.key === tab) ? tab : tabs[0].key;

  return (
    <section aria-labelledby="guide-h" className="card overflow-hidden">
      <div className="px-4 pt-4 flex items-center gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${theme.tile}`}>
          <Icon name="menu_book" className="text-[20px]" />
        </span>
        <div className="min-w-0">
          <div className="eyebrow">Shopping guide</div>
          <h2 id="guide-h" className="text-title-md font-semibold truncate">Buying {activeSub ? activeSub.name : category.name} with confidence</h2>
        </div>
      </div>

      <div role="tablist" aria-label="Shopping guide" className="mt-3 px-4 flex gap-1 border-b border-outline-variant/40 overflow-x-auto no-scrollbar">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={current === x.key}
            onClick={() => setTab(x.key)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              current === x.key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon name={x.icon} className="text-[18px]" /> {x.label}
          </button>
        ))}
      </div>

      <div className="p-4" role="tabpanel">
        {current === 'about' && (
          <div className="space-y-2">
            {activeSub?.description && <p className="text-sm font-medium">{activeSub.description}</p>}
            {category.description && (
              <>
                <p className={`text-sm text-on-surface-variant leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>{category.description}</p>
                {category.description.length > 180 && (
                  <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm text-primary font-semibold">
                    {expanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {current === 'guide' && (
          <ol className="space-y-4">
            {category.guide.map((g, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-sm">{g.title}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mt-0.5">{g.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        {current === 'faqs' && (
          <div className="-mx-4 -my-2 divide-y divide-outline-variant/40">
            {category.faqs.map((f, i) => (
              <details key={i} className="group" open={i === 0}>
                <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none font-medium text-sm hover:bg-surface-low">
                  {f.q}
                  <Icon name="expand_more" className="text-[22px] text-on-surface-variant transition-transform group-open:rotate-180 shrink-0" />
                </summary>
                <p className="px-4 pb-4 text-sm text-on-surface-variant leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        )}
      </div>

      <Link to="/help" className="flex items-center gap-2 px-4 py-3 border-t border-outline-variant/40 text-sm hover:bg-surface-low">
        <Icon name="support_agent" className="text-[20px] text-primary" />
        <span className="flex-1">Still have a question? <span className="text-primary font-semibold">Visit the Help centre</span></span>
        <Icon name="chevron_right" className="text-[20px] text-on-surface-variant" />
      </Link>
    </section>
  );
}

function RelatedSection({ related }) {
  return (
    <section aria-labelledby="related-h">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className="eyebrow">Keep exploring</div>
          <h2 id="related-h" className="text-title-lg font-semibold">More categories</h2>
        </div>
        <Link to="/categories" className="text-sm text-primary font-semibold whitespace-nowrap">See all</Link>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto no-scrollbar snap-x scroll-px-4 px-4 pb-1">
        {related.map((c) => {
          const rt = themeFor(c);
          return (
            <Link key={c.slug} to={categoryPath(c)} className={`snap-start shrink-0 w-36 relative overflow-hidden rounded-2xl bg-gradient-to-br ${rt.gradient} text-white p-3 h-28 flex flex-col justify-between`}>
              <span className="font-semibold text-sm leading-tight relative z-10">{c.name}</span>
              <span className="text-label-sm text-white/85 relative z-10">{countLabel(c.productCount || 0)}</span>
              <Icon name={rt.icon} className="absolute -right-2 -bottom-3 text-[64px] opacity-25" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
