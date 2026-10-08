import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import { useCatalogStream } from '../../lib/useSse';
import { toast } from '../../lib/toast';

// URL ↔ UI naming for the sort dropdown. `featured` is the server alias
// for createdAt desc; we label it "Newest" because that's honest about
// what the recommender is today — saving "Best match" for when the
// ranking considers review-count + recency, not just recency. Drop
// the duplicate `newest` URL key (it orders identically to `featured`)
// so the dropdown presents 4 distinct options, not 5.
const SORTS = [
  { key: 'featured',   label: 'Newest' },
  { key: 'price-asc',  label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'name-asc',   label: 'Name: A–Z' },
];

// PAGE_SIZE — smaller than the server default (24) so the 2-col mobile
// grid fits a couple of screens-worth of scroll above the paginator.
// Server enforces a max of 60; we ask for 12 here for mobile-first LCP.
const PAGE_SIZE = 12;

// Read a URLSearchParams-ish value into a plain filter-state object.
// `category` and `vendor` are multi-value (?category=Shoes&category=Watch)
// so getAll() collapses them into arrays. `pageSize` is intentionally
// omitted — it's UI-controlled, not URL-controlled.
function paramsToState(p) {
  return {
    q: p.get('q') || '',
    category: p.getAll('category'),
    vendor: p.getAll('vendor'),
    minPrice: p.get('minPrice') || '',
    maxPrice: p.get('maxPrice') || '',
    inStock: p.get('inStock') === 'true',
    sort: p.get('sort') || 'featured',
    page: Number(p.get('page') || '1') || 1,
  };
}

// Build the /api/products query string from a filter state. See server
// validators.productListQuery for the full schema this string must
// satisfy. Keeps `featured` (sorted-by-createdAt-desc) and page=1 out
// of the URL so deep links are clean.
function buildQueryString(state) {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set('q', state.q.trim());
  state.category.forEach((c) => p.append('category', c));
  state.vendor.forEach((v) => p.append('vendor', v));
  if (state.minPrice !== '') p.set('minPrice', String(state.minPrice));
  if (state.maxPrice !== '') p.set('maxPrice', String(state.maxPrice));
  if (state.inStock) p.set('inStock', 'true');
  if (state.sort && state.sort !== 'featured') p.set('sort', state.sort);
  if (state.page && state.page !== 1) p.set('page', String(state.page));
  return p.toString() ? `?${p.toString()}` : '';
}

// Stable serialization so useEffect dependency arrays use a primitive
// value instead of the state object reference. Without this the effect
// would refire every render because `state` is rebuilt by `useMemo`
// only when `params` (a fresh URLSearchParams) changes — but `params`
// still gets a new identity on every setParams. The pipe-delimited
// string avoids the false-positive refetch storm.
function serializeState(state) {
  return [
    state.q,
    state.category.join(','),
    state.vendor.join(','),
    state.minPrice,
    state.maxPrice,
    String(state.inStock),
    state.sort,
    state.page,
  ].join('|');
}

const RECENT_KEY = 'yobou_recent_searches';
const MAX_RECENT = 8;

const TRENDING = ['Electronics', 'Phones', 'Fashion', 'Shoes', 'Beauty', 'Gaming', 'Home'];

const CATEGORY_CHIPS = [
  { name: 'Electronics', icon: 'devices' },
  { name: 'Phones', icon: 'smartphone' },
  { name: 'Fashion', icon: 'checkroom' },
  { name: 'Beauty', icon: 'spa' },
  { name: 'Home', icon: 'chair' },
  { name: 'Gaming', icon: 'sports_esports' },
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [products, setProducts] = useState([]);
  const [popular, setPopular] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  const refreshCart = useStore((s) => s.refreshCartCount);

  // Sync URL → draft + input whenever deep-link / share / back-button
  // lands on a fresh URL. The next user-tap on Apply/Clear All will
  // write back to the URL.
  useEffect(() => { setDraft(state); setInputQ(state.q); }, [state]);

  // Open/close sheet via pushState so the browser back button closes
  // the sheet instead of leaving the search page. The popstate listener
  // fires once when the user pops the dummy entry we pushed on open;
  // closeSheet cleans up the dummy entry when Apply/X/Cancel fires.
  useEffect(() => {
    if (!showFilterSheet) return undefined;
    const onPop = () => setShowFilterSheet(false);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [showFilterSheet]);

  async function fetchProducts(targetState) {
    setLoading(true); setError('');
    try {
      const qs = buildQueryString(targetState);
      const result = await api(`/api/products${qs}`);
      setData({
        products: result.products || [],
        facets: result.facets || null,
        pagination: result.pagination || null,
      });
    } catch {
      setError('Could not search products. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // Refetch whenever the serialized state changes. `serialized`
  // collapses the array/object deps into a single string so the
  // dependency is reference-stable across renders.
  const serialized = serializeState(state);
  useEffect(() => { fetchProducts(state); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [serialized]);

  // Load recent search history.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setRecent(JSON.parse(window.localStorage.getItem(RECENT_KEY)) || []);
    } catch {
      setRecent([]);
    }
  }, []);

  // Show popular products when the user has not typed a query yet.
  useEffect(() => {
    if (initialQ) {
      setPopular([]);
      return;
    }
    let cancelled = false;
    api('/api/products?limit=8')
      .then(({ products }) => {
        if (!cancelled) setPopular(products || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [initialQ]);

  // Live sync — when a product is created/updated/deleted and the user's
  // search term is still the same, refetch so newly-matching products
  // show up without a manual refresh.
  useCatalogStream((frame) => {
    if (!frame?.event) return;
    if (['product_created', 'product_updated', 'product_deleted'].includes(frame.event)) {
      fetchProducts(state);
    }
  });

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (draft.category.length > 0) n += 1;
    if (draft.vendor.length > 0) n += 1;
    if (draft.minPrice !== '') n += 1;
    if (draft.maxPrice !== '') n += 1;
    if (draft.inStock) n += 1;
    return n;
  }, [draft]);

  function commitDraft() {
    setParams({ ...draft, page: 1 });
    closeSheet();
  }

  function submit(e) {
    e.preventDefault();
    const trimmed = q.trim();
    if (!trimmed) {
      setParams({});
      return;
    }
    setParams({ q: trimmed });
    // Persist the query as a recent search, deduped and capped.
    setRecent((prev) => {
      const next = [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  function clearSearch() {
    setQ('');
    setParams({});
  }

  function clearHistory() {
    setRecent([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(RECENT_KEY);
    }
  }

  function runQuery(term) {
    if (!term) return;
    setParams({ q: term });
  }

  function openSheet() {
    setDraft(state);
    setShowFilterSheet(true);
    window.history.pushState({ __filtersSheet: true }, '');
  }

  function clearAllFilters() {
    setDraft({
      ...draft,
      category: [], vendor: [], minPrice: '', maxPrice: '', inStock: false, page: 1,
    });
  }

  // Wipe every filter (chips + q) — used by the empty-state CTA. Goes
  // through setParams so the URL clears too, not just the chips.
  function wipeAll() {
    setParams({
      q: '', category: [], vendor: [], minPrice: '', maxPrice: '',
      inStock: false, sort: 'featured', page: 1,
    });
  }

  function goToPage(n) {
    setParams({ ...state, page: n });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function quickAdd(p) {
    try {
      await useStore.getState().ensureGuestSession();
      await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
      await refreshCart();
      // v0.3.16: no longer navigate to /cart. The cart badge in
      // MobileShell updates via refreshCartCount() above, the toast
      // confirms the add, and the ProductCard flips to "Added" for
      // 3s. The user stays on Search so they can keep browsing.
      toast.success(`Added ${p.name} to cart`);
    } catch (e) {
      toast.error(e?.data?.error || 'Could not add to cart');
    }
  }

  const activeSortLabel = SORTS.find((s) => s.key === state.sort)?.label || 'Sort';

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      {/* Search input — primary surface */}
      <header className="flex items-center gap-2">
        <Link to="/home" className="p-2 -ml-2" aria-label="Back to home"><Icon name="arrow_back" className="text-[24px]" /></Link>
        <form onSubmit={submit} className="flex-1">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none" />
            <input
              className="input-pill w-full pr-9"
              placeholder="Search products, brands…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            {q && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-surface-high text-on-surface-variant transition"
                aria-label="Clear search"
              >
                <Icon name="close" className="text-[16px]" />
              </button>
            )}
          </div>
        </form>
      </header>

      {/* Sort + Filter toolbar — result count on the right */}
      <div className="flex items-center gap-2">
        <button
          onClick={openSheet}
          className="h-10 px-3 rounded-lg border border-outline/40 bg-surface-low flex items-center gap-1.5 text-sm font-medium relative"
          aria-label={`Open filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
        >
          <Icon name="tune" className="text-[18px]" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-primary text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowSortMenu((s) => !s)}
            className="h-10 px-3 rounded-lg border border-outline/40 bg-surface-low flex items-center gap-1.5 text-sm font-medium"
            aria-haspopup="listbox"
            aria-expanded={showSortMenu}
          >
            <Icon name="swap_vert" className="text-[18px]" />
            <span className="hidden sm:inline">{activeSortLabel}</span>
            <Icon name="expand_more" className="text-[18px]" />
          </button>
          {showSortMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} aria-hidden="true" />
              <ul
                className="absolute right-0 top-full mt-1 w-56 bg-surface rounded-xl shadow-elevation-3 border border-outline/40 z-50 py-1"
                role="listbox"
              >
                {SORTS.map((s) => (
                  <li key={s.key}>
                    <button
                      onClick={() => { setParams({ ...state, sort: s.key, page: 1 }); setShowSortMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-low flex items-center justify-between ${state.sort === s.key ? 'text-primary font-semibold' : ''}`}
                      role="option"
                      aria-selected={state.sort === s.key}
                    >
                      {s.label}
                      {state.sort === s.key && <Icon name="check" className="text-[18px]" />}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex-1 text-right text-label-md text-on-surface-variant tabular-nums">
          {loading ? '…' : data.pagination ? `${data.pagination.total} match${data.pagination.total === 1 ? '' : 'es'}` : ''}
        </div>
      </div>

      {/* Active filter chips — horizontally scrollable, removable in
          place. "Clear all" sits at the end of the scrollable row so a
          long filter list still leaves a fast escape hatch. */}
      {activeFilterCount > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-1 whitespace-nowrap">
          {draft.category.map((c) => (
            <button
              key={`cat-${c}`}
              onClick={() => setDraft({ ...draft, category: draft.category.filter((x) => x !== c) })}
              className="chip flex items-center gap-1"
            >
              {c} <Icon name="close" className="text-[16px]" />
            </button>
          ))}
          {draft.vendor.map((v) => {
            const nameFromFacets = data.facets?.vendors.find((vv) => vv.id === v)?.name;
            return (
              <button
                key={`v-${v}`}
                onClick={() => setDraft({ ...draft, vendor: draft.vendor.filter((x) => x !== v) })}
                className="chip flex items-center gap-1"
              >
                {nameFromFacets || v} <Icon name="close" className="text-[16px]" />
              </button>
            );
          })}
          {(draft.minPrice !== '' || draft.maxPrice !== '') && (
            <button
              onClick={() => setDraft({ ...draft, minPrice: '', maxPrice: '' })}
              className="chip flex items-center gap-1"
            >
              ${draft.minPrice || '0'}–${draft.maxPrice || '∞'}
              <Icon name="close" className="text-[16px]" />
            </button>
          )}
          {draft.inStock && (
            <button
              onClick={() => setDraft({ ...draft, inStock: false })}
              className="chip flex items-center gap-1"
            >
              In stock <Icon name="close" className="text-[16px]" />
            </button>
          )}
          <button
            onClick={clearAllFilters}
            className="text-sm text-primary font-semibold px-2 self-center"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Error — non-blocking banner with a retry CTA */}
      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => fetchProducts(state)} className="text-primary font-semibold">Retry</button>
        </div>
      )}

      {/* Skeleton while the request is in flight */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      )}

      {!loading && !error && initialQ && (
        <div className="chip">{products.length} results for “{initialQ}”</div>
      )}

      {!loading && !error && products.length === 0 && initialQ && (
        <div className="text-center py-16 px-4 card">
          <div className="w-16 h-16 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-3">
            <Icon name="search_off" className="text-[28px] text-on-surface-variant" />
          </div>
          <p className="font-medium text-on-surface">No products found.</p>
          <p className="text-sm text-on-surface-variant mt-1">Try a different keyword or browse categories.</p>
          <Link to="/categories" className="btn-primary mt-4 inline-flex">
            Browse categories
          </Link>
        </div>
      )}

      {!loading && !error && !initialQ && (
        <div className="space-y-5">
          {/* Recent searches */}
          {recent.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-label-md font-bold text-on-surface">Recent searches</span>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-xs text-primary font-semibold"
                >
                  Clear
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => runQuery(term)}
                    className="snap-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-high text-on-surface text-sm whitespace-nowrap hover:bg-surface-highest transition"
                  >
                    <Icon name="history" className="text-[16px] text-on-surface-variant" />
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trending searches */}
          <div className="space-y-2">
            <span className="text-label-md font-bold text-on-surface">Trending searches</span>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {TRENDING.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => runQuery(term)}
                  className="snap-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-outline-variant/30 text-on-surface text-sm whitespace-nowrap hover:border-primary/40 transition"
                >
                  <Icon name="trending_up" className="text-[16px] text-secondary" />
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Category chips */}
          <div className="space-y-2">
            <span className="text-label-md font-bold text-on-surface">Shop by category</span>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {CATEGORY_CHIPS.map((c) => (
                <Link
                  key={c.name}
                  to={`/categories/${encodeURIComponent(c.name)}`}
                  className="snap-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-high text-on-surface text-sm whitespace-nowrap hover:bg-surface-highest transition"
                >
                  <Icon name={c.icon} className="text-[16px] text-primary" />
                  {c.name}
                </Link>
              ))}
            </div>
          </div>

          {/* Popular products when no query has been entered. */}
          {popular.length > 0 && (
            <div className="space-y-3">
              <span className="text-label-md font-bold text-on-surface">Popular right now</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {popular.map((p) => (
                  <ProductCard key={p.id} product={p} onAdd={quickAdd} />
                ))}
              </div>
            </div>
          )}

          {recent.length === 0 && popular.length === 0 && (
            <div className="text-center py-16 px-4 card">
              <div className="w-16 h-16 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-3">
                <Icon name="search" className="text-[28px] text-on-surface-variant" />
              </div>
              <p className="font-medium text-on-surface">What are you looking for?</p>
              <p className="text-sm text-on-surface-variant mt-1">Type a product name, brand, or category above.</p>
            </div>
          )}
        </div>
      )}

      {/* Results grid + page paginator */}
      {!loading && !error && data.products.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {data.products.map((p) => <ProductCard key={p.id} product={p} onAdd={quickAdd} />)}
          </div>

          {data.pagination && data.pagination.totalPages > 1 && (
            <nav className="flex items-center justify-between pt-2" aria-label="Pagination">
              <button
                onClick={() => goToPage(data.pagination.page - 1)}
                disabled={data.pagination.page <= 1}
                className="h-10 px-4 rounded-lg border border-outline/40 bg-surface-low flex items-center gap-1 text-sm font-medium disabled:opacity-40"
              >
                <Icon name="chevron_left" className="text-[18px]" /> Prev
              </button>
              <span className="text-sm text-on-surface-variant tabular-nums">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </span>
              <button
                onClick={() => goToPage(data.pagination.page + 1)}
                disabled={!data.pagination.hasMore}
                className="h-10 px-4 rounded-lg border border-outline/40 bg-surface-low flex items-center gap-1 text-sm font-medium disabled:opacity-40"
              >
                Next <Icon name="chevron_right" className="text-[18px]" />
              </button>
            </nav>
          )}
        </>
      )}

      {/* Filter sheet — lazy-mounted so the existing page chrome stays
          cheap to render when the sheet isn't open. Renders nothing
          before facets are loaded (first-render window). */}
      {showFilterSheet && data.facets && (
        <FilterSheet
          facets={data.facets}
          draft={draft}
          setDraft={setDraft}
          onApply={commitDraft}
          onClear={clearAllFilters}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

// Bottom-sheet filter UI. Lives in its own component so the main
// Search() body stays focused on the list surface. Three ways to
// dismiss: X button, Cancel button, browser back button (handled in
// the parent via pushState + popstate).
function FilterSheet({ facets, draft, setDraft, onApply, onClear, onClose }) {
  function toggleCategory(c) {
    setDraft({
      ...draft,
      category: draft.category.includes(c)
        ? draft.category.filter((x) => x !== c)
        : [...draft.category, c],
    });
  }
  function toggleVendor(v) {
    setDraft({
      ...draft,
      vendor: draft.vendor.includes(v)
        ? draft.vendor.filter((x) => x !== v)
        : [...draft.vendor, v],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between px-4 h-14 border-b border-outline-variant/30 flex-none">
        <button type="button" onClick={onClose} className="p-2 -ml-2" aria-label="Close filters">
          <Icon name="close" className="text-[24px]" />
        </button>
        <span className="font-bold">Filters</span>
        <button type="button" onClick={onClear} className="text-sm text-primary font-semibold px-2">Clear</button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Categories */}
        {facets.categories?.length > 0 && (
          <section>
            <h3 className="text-title-md font-bold mb-2">Category</h3>
            <ul className="space-y-1.5">
              {facets.categories.map((c) => (
                <li key={c.name}>
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.category.includes(c.name)}
                      onChange={() => toggleCategory(c.name)}
                      className="w-5 h-5 accent-primary"
                    />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-label-md text-on-surface-variant tabular-nums">{c.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Brands (vendors) */}
        {facets.vendors?.length > 0 && (
          <section>
            <h3 className="text-title-md font-bold mb-2">Brand</h3>
            <ul className="space-y-1.5">
              {facets.vendors.map((v) => (
                <li key={v.id}>
                  <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.vendor.includes(v.id)}
                      onChange={() => toggleVendor(v.id)}
                      className="w-5 h-5 accent-primary"
                    />
                    <span className="flex-1">{v.name}</span>
                    <span className="text-label-md text-on-surface-variant tabular-nums">{v.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Price range. Inputs are in cents to match the API's
            priceCents field; the helper text below shows the price
            envelope across the shop in formatted dollars so users
            know what range the shop actually carries before they
            enter numbers. */}
        <section>
          <h3 className="text-title-md font-bold mb-2">Price</h3>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Min"
                value={draft.minPrice}
                onChange={(e) => setDraft({ ...draft, minPrice: e.target.value })}
                className="input pl-7 w-full"
                aria-label="Minimum price (cents)"
              />
            </div>
            <span className="text-on-surface-variant">–</span>
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                placeholder="Max"
                value={draft.maxPrice}
                onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })}
                className="input pl-7 w-full"
                aria-label="Maximum price (cents)"
              />
            </div>
          </div>
          {facets.priceRange && facets.priceRange.min != null && facets.priceRange.max != null && (
            <p className="text-label-md text-on-surface-variant mt-2">
              In this shop: ${(facets.priceRange.min / 100).toFixed(2)}–${(facets.priceRange.max / 100).toFixed(2)}
            </p>
          )}
        </section>

        {/* In-stock toggle — single switch on the right; label on the
            left toggles the same state for big-tap accessibility. */}
        <section>
          <label className="flex items-center justify-between py-1.5 cursor-pointer gap-3">
            <span className="text-title-md font-bold flex-1">In stock only</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.inStock}
              onClick={() => setDraft({ ...draft, inStock: !draft.inStock })}
              className={`relative w-11 h-6 rounded-full transition-colors flex-none ${draft.inStock ? 'bg-primary' : 'bg-outline-variant'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.inStock ? 'translate-x-5' : ''}`} />
            </button>
          </label>
        </section>
      </div>

      <footer className="px-4 py-3 border-t border-outline-variant/30 flex items-center gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex-none bg-surface">
        <button
          onClick={onClose}
          className="flex-1 h-12 rounded-full border border-outline/40 font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={onApply}
          className="flex-[2] h-12 rounded-full bg-primary text-white font-semibold"
        >
          Apply filters
        </button>
      </footer>
    </div>
  );
}
