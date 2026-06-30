import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard from '../../components/ProductCard';
import { ProductCardSkeleton } from '../../components/ProductCard';
import { useCatalogStream } from '../../lib/useSse';

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

  async function search(term) {
    if (!term.trim()) {
      setProducts([]);
      return;
    }
    setLoading(true); setError('');
    try {
      const { products } = await api(`/api/products?q=${encodeURIComponent(term.trim())}`);
      setProducts(products || []);
    } catch {
      setError('Could not search products.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search(initialQ);
  }, [initialQ]);

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
    if (!['product_created', 'product_updated', 'product_deleted'].includes(frame.event)) return;
    search(initialQ);
  });

  async function quickAdd(p) {
    await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
    await refreshCart();
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

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
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

      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => search(initialQ)} className="text-primary font-semibold">Retry</button>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
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

      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {products.map((p) => <ProductCard key={p.id} product={p} onAdd={quickAdd} />)}
        </div>
      )}
    </div>
  );
}
