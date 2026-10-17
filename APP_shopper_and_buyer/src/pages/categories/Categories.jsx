// Categories — the department browser.
//
// Two-pane layout (the pattern shoppers know from Jumia / Amazon / Shein):
//   left  — a sticky rail of every category
//   right — the selected category: banner + its departments
// so any subcategory is two taps away instead of a long scroll.
//
// Typing in the search box swaps the panes for results across
// categories AND departments ("chargers" → Phones › Chargers & Cables).
//
// Data: GET /api/products/categories (admin-curated, live-synced).
// Selection lives in ?c=<slug> so Back returns to the same category.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApi } from '../../useApi.jsx';
import { useProductLiveSync } from '../../lib/useProductLiveSync';
import { themeFor, categoryPath } from '../../lib/categoryTheme';
import { countLabel } from '../../lib/categoryFormat';
import ProductRow from '../home/ProductRow';
import { isShownDeal, onPage, dealPercent } from './CategoryShowcase';
import { api } from '../../api';
import { useStore } from '../../store';
import { toast } from '../../lib/toast';

// Cards in the narrow right-hand pane: two visible on a phone.
const PANE_CARD = 'w-[150px] md:w-[180px] lg:w-[200px] shrink-0';

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

// Height of the sticky search bar; the rail sticks just below it and
// stops above the 5rem bottom nav.
const SEARCH_BAR_H = 68;

export default function Categories() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const { data, error, loading, refetch } = useApi('/api/products/categories');
  useProductLiveSync(refetch, { alsoCategories: true });
  const categories = data?.categories || [];

  const selectedSlug = params.get('c');
  const selected = categories.find((c) => c.slug === selectedSlug)
    || categories.find((c) => c.featured)
    || categories[0]
    || null;

  function select(c) {
    setParams((p) => { const n = new URLSearchParams(p); n.set('c', c.slug); return n; }, { replace: true });
    window.scrollTo({ top: 0 });
  }

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const cats = categories.filter((c) => c.name.toLowerCase().includes(q) || (c.tagline || '').toLowerCase().includes(q));
    const subs = [];
    for (const c of categories) {
      for (const s of c.subcategories || []) {
        if (s.name.toLowerCase().includes(q)) subs.push({ category: c, sub: s });
      }
    }
    return { cats, subs };
  }, [categories, q]);

  return (
    <div className="pb-6">
      {/* Sticky search — the page's only header; the bottom nav already
          says where you are. */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-outline-variant/40 px-4 py-3 lg:static lg:!h-auto lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:pt-8 lg:pb-5 lg:flex lg:items-end lg:justify-between lg:gap-6" style={{ height: SEARCH_BAR_H }}>
        <div className="hidden lg:block">
          <h1 className="text-headline-lg font-bold">All categories</h1>
          <p className="text-sm text-on-surface-variant mt-1">Every department on Yobou, from approved local sellers.</p>
        </div>
        <div className="relative lg:w-[420px]">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
          <input
            className="input pl-10 pr-10 w-full h-11"
            placeholder="Search categories and departments"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search categories and departments"
            type="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant" aria-label="Clear search">
              <Icon name="close" className="text-[20px]" />
            </button>
          )}
        </div>
      </div>

      {error && !data && (
        <div className="m-4 card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
          <span>Could not load categories.</span>
          <button type="button" onClick={refetch} className="text-primary font-semibold">Retry</button>
        </div>
      )}

      {loading && !data && <BrowserSkeleton />}

      {results && <SearchResults results={results} query={query} />}

      {!results && data && selected && (
        <div className="grid grid-cols-[92px_1fr] md:grid-cols-[200px_1fr] lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6 lg:px-4 items-start">
          <CategoryRail categories={categories} selected={selected} onSelect={select} />
          <SelectedPane category={selected} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CategoryRail({ categories, selected, onSelect }) {
  const activeRef = useRef(null);
  // Keep the active row visible when the selection comes from the URL.
  useEffect(() => { activeRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [selected?.slug]);

  return (
    <nav
      aria-label="Categories"
      className="sticky self-start overflow-y-auto no-scrollbar bg-surface-low border-r border-outline-variant/40 lg:!top-[160px] lg:!max-h-[calc(100vh-180px)] lg:bg-white lg:border lg:rounded-2xl lg:py-2"
      style={{ top: SEARCH_BAR_H, maxHeight: `calc(100dvh - ${SEARCH_BAR_H}px - 5rem - env(safe-area-inset-bottom))` }}
    >
      <ul role="tablist" aria-orientation="vertical">
        {categories.map((c) => {
          const active = c.slug === selected.slug;
          const t = themeFor(c);
          return (
            <li key={c.slug}>
              <button
                ref={active ? activeRef : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(c)}
                className={`relative w-full flex flex-col md:flex-row items-center md:items-center gap-1.5 md:gap-3 px-2 md:px-3 py-3 text-center md:text-left transition-colors ${
                  active ? 'bg-white text-primary' : 'text-on-surface-variant hover:bg-white/60'
                }`}
              >
                {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" aria-hidden="true" />}
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? t.tile : 'bg-white/70'}`}>
                  <Icon name={t.icon} fill={active} className="text-[22px]" />
                </span>
                <span className={`text-[11px] md:text-sm leading-tight line-clamp-2 ${active ? 'font-bold' : 'font-medium'}`}>{c.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SelectedPane({ category }) {
  const t = themeFor(category);
  const subs = category.subcategories || [];
  return (
    <section aria-labelledby="pane-h" className="min-w-0 p-3 md:p-5 lg:p-0 space-y-5 lg:space-y-8" key={category.slug}>
      {/* Banner */}
      <Link to={categoryPath(category)} className={`reveal reveal-fade-up relative block overflow-hidden rounded-2xl bg-gradient-to-br ${t.gradient} text-white p-4 lg:p-8 min-h-[132px] lg:min-h-[200px] group`}>
        <div className="relative z-10 max-w-[78%]">
          {category.featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide mb-1.5">
              <Icon name="star" fill className="text-[12px]" /> Featured
            </span>
          )}
          <h1 id="pane-h" className="text-title-lg lg:text-headline-lg font-bold text-white leading-tight">{category.name}</h1>
          {category.tagline && <p className="text-label-md text-white/85 mt-1 line-clamp-2">{category.tagline}</p>}
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white text-on-surface px-3 py-1.5 text-label-md font-semibold">
            Shop all{category.productCount > 0 ? ` ${category.productCount}` : ''}
            <Icon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
        <Icon name={t.icon} className="absolute -right-3 -bottom-4 text-[110px] lg:text-[180px] opacity-20" />
      </Link>

      {/* Departments */}
      {subs.length > 0 ? (
        <div>
          <h2 className="text-title-md font-semibold mb-3">Shop by department</h2>
          <ul className="reveal-stagger stagger-pop grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-2 gap-y-4 lg:gap-y-6" style={{ '--stagger-step': '30ms' }}>
            {subs.map((s) => (
              <li key={s.slug}>
                <Link to={categoryPath(category, s)} className="flex flex-col items-center gap-1.5 text-center group">
                  <span className={`relative w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center ${t.tile} transition-transform group-active:scale-95`}>
                    <Icon name={s.icon || t.icon} className="text-[28px] md:text-[32px]" />
                    {s.productCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-on-surface text-[10px] font-bold flex items-center justify-center shadow ring-1 ring-black/5">
                        {s.productCount}
                      </span>
                    )}
                  </span>
                  <span className="text-[12px] font-medium leading-tight line-clamp-2">{s.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">Browse everything in {category.name} from the banner above.</p>
      )}

      <PaneProducts category={category} />

      <Link to={categoryPath(category)} className="card p-3 flex items-center gap-3 group">
        <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon name="tips_and_updates" className="text-[22px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold">{category.name} buying guide</span>
          <span className="block text-label-sm text-on-surface-variant">Tips and answers before you buy</span>
        </span>
        <Icon name="chevron_right" className="text-[20px] text-on-surface-variant" />
      </Link>
    </section>
  );
}

// Home-style product sections for the selected category: its best
// deals, then one rail of cards per department. One request per
// category; sections without products are skipped.
function PaneProducts({ category }) {
  const { data, loading } = useApi(
    `/api/products?${new URLSearchParams({ category: category.name, sort: 'newest', pageSize: '60' })}`,
  );
  const products = data?.products || [];
  if (loading && !data) {
    return <ProductRow loading skeletonCount={3} cardWidth={PANE_CARD} />;
  }
  if (products.length === 0) return null;

  const inStock = products.filter((p) => p.stock > 0);
  const deals = inStock.filter(isShownDeal).sort((a, b) => dealPercent(b) - dealPercent(a)).slice(0, 10);
  const rails = (category.subcategories || [])
    .map((s) => ({ sub: s, items: products.filter((p) => onPage(p, category.name, s.name)) }))
    .filter((r) => r.items.length > 0);

  return (
    <div className="space-y-6">
      {deals.length > 0 && (
        <ProductRow
          title="Top deals"
          icon="local_offer"
          actionTo={categoryPath(category)}
          products={deals}
          onAdd={addToCart}
          cardWidth={PANE_CARD}
        />
      )}
      {rails.map(({ sub, items }) => (
        <ProductRow
          key={sub.slug}
          title={sub.name}
          actionTo={categoryPath(category, sub)}
          products={items}
          onAdd={addToCart}
          cardWidth={PANE_CARD}
        />
      ))}
    </div>
  );
}

function SearchResults({ results, query }) {
  const { cats, subs } = results;
  if (cats.length === 0 && subs.length === 0) {
    return (
      <div className="text-center py-16 px-6 text-on-surface-variant">
        <div className="w-16 h-16 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-3">
          <Icon name="search_off" className="text-[28px]" />
        </div>
        <p className="font-medium text-on-surface">No categories match “{query.trim()}”</p>
        <p className="text-sm mt-1">Try a product name instead — we’ll search the whole store.</p>
        <Link to={`/search?q=${encodeURIComponent(query.trim())}`} className="btn-primary mt-4 inline-flex px-5 py-2.5">
          Search products for “{query.trim()}”
        </Link>
      </div>
    );
  }
  const rows = [
    ...cats.map((c) => ({ key: c.slug, to: categoryPath(c), icon: themeFor(c).icon, tile: themeFor(c).tile, title: c.name, meta: `Category · ${countLabel(c.productCount)}` })),
    ...subs.map(({ category, sub }) => ({
      key: `${category.slug}/${sub.slug}`,
      to: categoryPath(category, sub),
      icon: sub.icon || themeFor(category).icon,
      tile: themeFor(category).tile,
      title: sub.name,
      meta: `${category.name} · ${countLabel(sub.productCount)}`,
    })),
  ];
  return (
    <div className="p-4 space-y-3">
      <p className="text-label-md text-on-surface-variant">{rows.length} result{rows.length === 1 ? '' : 's'}</p>
      <ul className="card divide-y divide-outline-variant/40 overflow-hidden">
        {rows.map((r) => (
          <li key={r.key}>
            <Link to={r.to} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-low">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.tile}`}>
                <Icon name={r.icon} className="text-[20px]" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate"><Highlight text={r.title} query={query} /></span>
                <span className="block text-label-sm text-on-surface-variant">{r.meta}</span>
              </span>
              <Icon name="chevron_right" className="text-[20px] text-on-surface-variant" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to={`/search?q=${encodeURIComponent(query.trim())}`} className="block text-center text-sm text-primary font-semibold py-2">
        Search products for “{query.trim()}” →
      </Link>
    </div>
  );
}

function Highlight({ text, query }) {
  const q = query.trim();
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-secondary/40 text-inherit rounded px-0.5">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function BrowserSkeleton() {
  return (
    <div className="grid grid-cols-[92px_1fr] md:grid-cols-[200px_1fr] animate-pulse" aria-hidden="true">
      <div className="bg-surface-low space-y-4 py-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-xl bg-surface-high" />
            <div className="w-12 h-2.5 rounded bg-surface-high" />
          </div>
        ))}
      </div>
      <div className="p-3 space-y-5">
        <div className="h-[132px] rounded-2xl bg-surface-high" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="w-16 h-16 rounded-2xl bg-surface-high" />
              <div className="w-14 h-2.5 rounded bg-surface-high" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
