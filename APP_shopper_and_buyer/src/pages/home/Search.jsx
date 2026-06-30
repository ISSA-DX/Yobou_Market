import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard from '../../components/ProductCard';
import { ProductCardSkeleton } from '../../components/ProductCard';
import { useCatalogStream } from '../../lib/useSse';

export default function Search() {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    if (!trimmed) return;
    setParams({ q: trimmed });
  }

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/home" className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></Link>
        <form onSubmit={submit} className="flex-1">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
            <input
              className="input pl-10 w-full"
              placeholder="Search products…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
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
        <div className="text-center py-16 text-on-surface-variant">
          <Icon name="search" className="text-[44px]" />
          <p className="mt-2">No products found.</p>
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
