import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import { useCatalogStream } from '../../lib/useSse';

const CATEGORY_META = {
  electronics: { icon: 'devices', gradient: 'from-blue-500 to-indigo-600' },
  phones: { icon: 'smartphone', gradient: 'from-indigo-500 to-violet-600' },
  computers: { icon: 'computer', gradient: 'from-slate-600 to-slate-800' },
  fashion: { icon: 'checkroom', gradient: 'from-pink-500 to-rose-500' },
  shoes: { icon: 'steps', gradient: 'from-orange-500 to-amber-500' },
  beauty: { icon: 'spa', gradient: 'from-rose-400 to-fuchsia-500' },
  home: { icon: 'chair', gradient: 'from-amber-500 to-orange-600' },
  kitchen: { icon: 'blender', gradient: 'from-teal-500 to-emerald-600' },
  sports: { icon: 'sports_basketball', gradient: 'from-green-500 to-emerald-600' },
  fitness: { icon: 'fitness_center', gradient: 'from-lime-500 to-green-600' },
  toys: { icon: 'toys', gradient: 'from-yellow-400 to-orange-500' },
  gaming: { icon: 'sports_esports', gradient: 'from-violet-500 to-purple-700' },
  'tv & audio': { icon: 'tv', gradient: 'from-cyan-500 to-blue-600' },
  appliances: { icon: 'kitchen', gradient: 'from-stone-500 to-stone-700' },
  automotive: { icon: 'directions_car', gradient: 'from-red-500 to-rose-600' },
  books: { icon: 'menu_book', gradient: 'from-emerald-500 to-teal-700' },
  grocery: { icon: 'local_grocery_store', gradient: 'from-lime-600 to-green-700' },
  health: { icon: 'medical_services', gradient: 'from-sky-500 to-cyan-600' },
  'pet supplies': { icon: 'pets', gradient: 'from-amber-500 to-orange-600' },
  baby: { icon: 'child_care', gradient: 'from-fuchsia-400 to-pink-500' },
  jewelry: { icon: 'diamond', gradient: 'from-purple-500 to-indigo-600' },
  watches: { icon: 'watch', gradient: 'from-zinc-500 to-zinc-700' },
  bags: { icon: 'shopping_bag', gradient: 'from-orange-500 to-amber-600' },
  office: { icon: 'print', gradient: 'from-neutral-500 to-neutral-700' },
  garden: { icon: 'yard', gradient: 'from-green-600 to-emerald-700' },
  tools: { icon: 'construction', gradient: 'from-gray-500 to-gray-700' },
  'arts & crafts': { icon: 'brush', gradient: 'from-fuchsia-500 to-purple-600' },
  musical: { icon: 'music_note', gradient: 'from-red-500 to-pink-600' },
};

function metaFor(slug) {
  const key = slug.toLowerCase().replace(/-/g, ' ');
  return CATEGORY_META[key] || { icon: 'category', gradient: 'from-primary to-primary-container' };
}

const SORTS = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: Low to High' },
  { key: 'price-desc', label: 'Price: High to Low' },
  { key: 'name-asc', label: 'Name: A–Z' },
];

export default function CategoryDetail() {
  const { slug } = useParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const [showSort, setShowSort] = useState(false);
  const refreshCart = useStore((s) => s.refreshCartCount);

  const title = useMemo(
    () => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    [slug]
  );
  const meta = useMemo(() => metaFor(slug), [slug]);

  async function load() {
    setLoading(true); setError('');
    try {
      const { products } = await api(`/api/products?category=${encodeURIComponent(slug)}`);
      setProducts(products || []);
    } catch {
      setError('Could not load products.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [slug]);
  useEffect(() => { setQuery(''); setSort('featured'); }, [slug]);

  // Live sync — when any product is created/updated/deleted anywhere,
  // refetch this category's listing so newly-added products appear
  // without a manual refresh. Could be narrowed with `match: (f) =>
  // f.category === title` once the server includes category in the
  // catalog payload (currently it does).
  useCatalogStream((frame) => {
    if (!frame?.event) return;
    if (!['product_created', 'product_updated', 'product_deleted'].includes(frame.event)) return;
    if (frame.category && frame.category !== title) return;
    load();
  });

  async function quickAdd(p) {
    await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
    await refreshCart();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? products.filter((p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        )
      : [...products];

    if (sort === 'price-asc') {
      list.sort((a, b) => (a.priceCents || 0) - (b.priceCents || 0));
    } else if (sort === 'price-desc') {
      list.sort((a, b) => (b.priceCents || 0) - (a.priceCents || 0));
    } else if (sort === 'name-asc') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return list;
  }, [products, query, sort]);

  const activeSortLabel = SORTS.find((s) => s.key === sort)?.label || 'Featured';

  return (
    <div className="pb-6 space-y-4">
      <div className={`relative overflow-hidden bg-gradient-to-br ${meta.gradient} text-white`}>
        <div className="px-4 pt-4 pb-6">
          <header className="flex items-center gap-2 mb-4">
            <Link
              to="/categories"
              className="p-2 -ml-2 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Back"
            >
              <Icon name="arrow_back" className="text-[24px]" />
            </Link>
            <span className="text-label-md opacity-90">Categories</span>
          </header>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <Icon name={meta.icon} className="text-[36px]" />
            </div>
            <div>
              <h1 className="text-headline-lg font-bold">{title}</h1>
              <p className="text-label-md opacity-90">
                {loading ? 'Loading…' : `${products.length} item${products.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        </div>
        <Icon name={meta.icon} className="absolute -right-4 -bottom-8 text-[160px] opacity-15" />
      </div>

      <div className="px-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
            <input
              className="input pl-10 w-full"
              placeholder={`Search in ${title}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSort((s) => !s)}
              className="h-12 px-3 rounded-md bg-surface-low border border-outline/40 flex items-center gap-1.5 text-sm font-medium"
              aria-haspopup="listbox"
              aria-expanded={showSort}
            >
              <Icon name="sort" className="text-[20px]" />
              <span className="hidden sm:inline">{activeSortLabel}</span>
            </button>
            {showSort && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSort(false)}
                />
                <ul
                  className="absolute right-0 top-full mt-1 w-52 bg-surface rounded-xl shadow-elevation-3 border border-outline/40 z-50 py-1"
                  role="listbox"
                >
                  {SORTS.map((s) => (
                    <li key={s.key}>
                      <button
                        onClick={() => { setSort(s.key); setShowSort(false); }}
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
        </div>

        {error && (
          <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={load} className="text-primary font-semibold">Retry</button>
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        )}

        {!loading && !error && (
          <>
            {filtered.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-label-md text-on-surface-variant">
                  {filtered.length} result{filtered.length === 1 ? '' : 's'}
                </span>
                {query.trim() && (
                  <button
                    onClick={() => setQuery('')}
                    className="text-sm text-primary font-semibold flex items-center gap-0.5"
                  >
                    Clear <Icon name="close" className="text-[16px]" />
                  </button>
                )}
              </div>
            )}

            {filtered.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {filtered.map((p) => <ProductCard key={p.id} product={p} onAdd={quickAdd} />)}
              </div>
            )}

            {filtered.length === 0 && products.length > 0 && (
              <div className="text-center py-16 text-on-surface-variant">
                <div className="w-16 h-16 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-3">
                  <Icon name="search_off" className="text-[28px]" />
                </div>
                <p className="font-medium">No matches for “{query.trim()}”</p>
                <button
                  onClick={() => setQuery('')}
                  className="mt-2 text-sm text-primary font-semibold"
                >
                  Clear search
                </button>
              </div>
            )}

            {products.length === 0 && (
              <div className="text-center py-16 text-on-surface-variant">
                <div className="w-20 h-20 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-4">
                  <Icon name="inventory_2" className="text-[40px]" />
                </div>
                <p className="text-title-md font-medium">No products yet</p>
                <p className="text-sm mt-1 max-w-xs mx-auto">Check back soon — we’re adding new items to {title} every day.</p>
                <Link
                  to="/categories"
                  className="mt-4 inline-flex items-center gap-1 bg-primary text-white px-5 py-2.5 rounded-full text-sm font-semibold"
                >
                  <Icon name="explore" className="text-[18px]" /> Browse categories
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
