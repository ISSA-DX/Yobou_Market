import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import CameraSearchButton from '../../components/CameraSearchButton';
import FilterSections, { SearchSidebar } from './FilterSections';
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
    // Home section "See all" links (curated placements).
    showOnNewArrivals: p.get('showOnNewArrivals') === 'true',
    showOnRecentDeals: p.get('showOnRecentDeals') === 'true',
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
  if (state.showOnNewArrivals) p.set('showOnNewArrivals', 'true');
  if (state.showOnRecentDeals) p.set('showOnRecentDeals', 'true');
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

export default function Search() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => paramsToState(params), [params]);
  const [inputQ, setInputQ] = useState(state.q);
  const [data, setData] = useState({ products: [], facets: null, pagination: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  // `draft` is the sheet-local filter state. We commit to the URL only
  // on "Apply" — this prevents spamming the browser history every
  // time the user toggles a checkbox, and prevents the live results
  // grid from re-fetching on every keystroke.
  const [draft, setDraft] = useState(state);
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

  // Live sync — when any product is created/updated/deleted elsewhere
  // in the catalog, refetch this view's results so newly-matching
  // products appear without a manual refresh.
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

  function closeSheet() {
    setShowFilterSheet(false);
    // Pop the dummy entry we pushed on open. Only if our marker is
    // still on top — guards against the popstate handler that
    // already cleared it.
    if (window.history.state && window.history.state.__filtersSheet) {
      window.history.back();
    }
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
      toast.addedToCart(p);
    } catch (e) {
      toast.error(e?.data?.error || 'Could not add to cart');
    }
  }

  const activeSortLabel = SORTS.find((s) => s.key === state.sort)?.label || 'Sort';

  // Laptop filter sidebar: ticking a box applies at once; the price
  // range applies on its Go button so typing doesn't refetch per key.
  function sidebarSet(next) {
    setDraft(next);
    if (next.minPrice === draft.minPrice && next.maxPrice === draft.maxPrice) setParams({ ...next, page: 1 });
  }
  function applySidebarPrice() { setParams({ ...draft, page: 1 }); }
  function clearSidebar() {
    setParams({ ...state, category: [], vendor: [], minPrice: '', maxPrice: '', inStock: false, page: 1 });
  }
  const heading = state.showOnNewArrivals ? 'New arrivals'
    : state.showOnRecentDeals ? 'Recent deals'
      : state.q ? `Results for "${state.q}"` : 'All products';

  return (
    <div className="px-4 pt-4 pb-6 lg:pt-8 lg:grid lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-8 lg:items-start">
      <SearchSidebar facets={data.facets} draft={draft} activeFilterCount={activeFilterCount} onChange={sidebarSet} onApplyPrice={applySidebarPrice} onClear={clearSidebar} />
    <div className="space-y-4 min-w-0">
      <h1 className="hidden lg:block text-headline-lg font-bold text-on-surface">{heading}</h1>
      {/* Search input — primary surface */}
      <header className="flex items-center gap-2 lg:hidden">
        <Link to="/home" className="p-2 -ml-2" aria-label="Back">
          <Icon name="arrow_back" className="text-[24px]" />
        </Link>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ ...state, q: inputQ, page: 1 });
          }}
          className="flex-1"
        >
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
            <input
              className="input pl-10 pr-12 w-full"
              placeholder="Search products…"
              value={inputQ}
              onChange={(e) => setInputQ(e.target.value)}
              aria-label="Search products"
              autoFocus
            />
            <CameraSearchButton className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-primary hover:bg-primary/10 flex items-center justify-center" />
          </div>
        </form>
      </header>

      {/* Sort + Filter toolbar — result count on the right */}
      <div className="flex items-center gap-2">
        <button
          onClick={openSheet}
          className="lg:hidden h-10 px-3 rounded-lg border border-outline/40 bg-surface-low flex items-center gap-1.5 text-sm font-medium relative"
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

      {/* Curated section view (from a Home "See all" link). */}
      {(state.showOnNewArrivals || state.showOnRecentDeals) && (
        <div className="reveal reveal-fade-down flex items-center gap-2 rounded-lg bg-primary/[0.06] border border-primary/15 px-3 py-2">
          <Icon name={state.showOnNewArrivals ? 'new_releases' : 'local_offer'} className="text-primary text-[20px]" />
          <span className="flex-1 text-sm font-semibold">
            {state.showOnNewArrivals ? 'New arrivals' : 'Recent deals'}
          </span>
          <button
            type="button"
            onClick={() => setParams({ ...state, showOnNewArrivals: false, showOnRecentDeals: false, page: 1 })}
            className="text-label-md font-semibold text-primary"
          >
            Show all products
          </button>
        </div>
      )}

      {/* Active filter chips — horizontally scrollable, removable in
          place. "Clear all" sits at the end of the scrollable row so a
          long filter list still leaves a fast escape hatch. */}
      {activeFilterCount > 0 && (
        <div className="reveal-stagger stagger-left flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-1 whitespace-nowrap" style={{ "--stagger-step": "40ms" }}>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      )}

      {/* Empty state — different microcopy based on whether the user
          typed something vs. only had filters active. Both paths offer
          a one-tap escape from the dead end. */}
      {!loading && !error && data.products.length === 0 && (
        <div className="text-center py-16 text-on-surface-variant">
          <div className="w-16 h-16 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-3">
            <Icon name={state.q ? 'search_off' : 'filter_alt_off'} className="text-[28px]" />
          </div>
          <p className="text-title-md font-medium text-on-surface">
            {state.q ? `No products match “${state.q}”.` : 'No products match all your filters.'}
          </p>
          <p className="text-sm mt-1">Try removing some filters or broadening your search.</p>
          {(state.q || activeFilterCount > 0) && (
            <button
              onClick={wipeAll}
              className="mt-4 inline-flex items-center gap-1 bg-primary text-white px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              <Icon name="filter_alt_off" className="text-[18px]" /> Clear filters
            </button>
          )}
          {!state.q && activeFilterCount === 0 && (
            <Link
              to="/categories"
              className="mt-4 inline-flex items-center gap-1 bg-primary text-white px-5 py-2.5 rounded-full text-sm font-semibold"
            >
              <Icon name="explore" className="text-[18px]" /> Browse categories
            </Link>
          )}
        </div>
      )}

      {/* Results grid + page paginator */}
      {!loading && !error && data.products.length > 0 && (
        <>
          <div className="reveal-stagger stagger-zoom grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
    </div>
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
  return (
    <div className="anim-sheet fixed inset-0 z-50 flex flex-col bg-surface">
      <header className="flex items-center justify-between px-4 h-14 border-b border-outline-variant/30 flex-none">
        <button type="button" onClick={onClose} className="p-2 -ml-2" aria-label="Close filters">
          <Icon name="close" className="text-[24px]" />
        </button>
        <span className="font-bold">Filters</span>
        <button type="button" onClick={onClear} className="text-sm text-primary font-semibold px-2">Clear</button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <FilterSections facets={facets} draft={draft} setDraft={setDraft} />
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
