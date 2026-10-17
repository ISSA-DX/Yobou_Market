// Public store page — /stores/:id
//
// A partner's shop front: banner, logo and description (edited in the
// partner portal → Profile), headline numbers, their deals, and every
// live product with category filter, sort and load-more.
// Data: GET /api/stores/:id, GET /api/products?vendor=:id
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import ProductRow from '../home/ProductRow';
import { useApi } from '../../useApi.jsx';
import { useStore } from '../../store';
import { toast } from '../../lib/toast';
import { plural } from '../../lib/categoryFormat';
import { RAIL_CARD, isShownDeal, dealPercent } from '../categories/CategoryShowcase';

const SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['price-asc', 'Price: Low to High'], ['price-desc', 'Price: High to Low']];

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

export default function StorePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const storeApi = useApi(`/api/stores/${encodeURIComponent(id)}`);
  const dealsApi = useApi(`/api/products?${new URLSearchParams({ vendor: id, pageSize: '30', sort: 'newest' })}`);
  const store = storeApi.data?.store;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [id]);

  if (storeApi.error && !storeApi.data) {
    const missing = storeApi.error?.status === 404;
    return (
      <div className="px-4 py-16 text-center text-on-surface-variant">
        <Icon name={missing ? 'storefront' : 'cloud_off'} className="text-[44px]" />
        <p className="text-title-md font-medium text-on-surface mt-2">{missing ? 'This store isn’t available' : 'Could not load this store'}</p>
        <div className="mt-4 flex justify-center gap-2">
          {!missing && <button type="button" className="btn-primary px-5 py-2" onClick={storeApi.refetch}>Try again</button>}
          <Link to="/categories" className="btn-secondary px-5 py-2">Browse categories</Link>
        </div>
      </div>
    );
  }

  const deals = (dealsApi.data?.products || []).filter((p) => p.stock > 0 && isShownDeal(p)).sort((a, b) => dealPercent(b) - dealPercent(a));

  return (
    <div className="pb-8 lg:pt-6 lg:px-4">
      {/* Banner + identity */}
      <header className="relative">
        <div className="relative h-40 sm:h-52 lg:h-64 bg-gradient-to-br from-primary to-primary-container overflow-hidden lg:rounded-3xl">
          {store?.bannerUrl && <img src={store.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden="true" />
          <button type="button" onClick={() => navigate(-1)} className="lg:hidden absolute top-3 left-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center" aria-label="Back">
            <Icon name="arrow_back" />
          </button>
        </div>
        <div className="px-4 lg:px-8 -mt-10 lg:-mt-14 relative">
          <span className="w-20 h-20 lg:w-28 lg:h-28 rounded-2xl bg-white ring-4 ring-white shadow-lg flex items-center justify-center overflow-hidden">
            {store?.logoUrl ? <img src={store.logoUrl} alt="" className="w-full h-full object-cover" /> : <Icon name="storefront" className="text-[36px] text-primary" />}
          </span>
          <h1 className="mt-2 text-headline-md font-extrabold leading-tight text-on-surface">{store?.businessName || ' '}</h1>
          <div className="flex items-center gap-1 text-label-md text-tertiary font-semibold"><Icon name="verified" fill className="text-[16px]" /> Approved seller</div>
        </div>
      </header>

      <div className="px-4 pt-4 lg:px-0 lg:pt-6 space-y-6 lg:space-y-8">
        {store && (
          <>
            <div className="flex flex-wrap gap-2">
              <Stat icon="inventory_2" text={plural(store.productCount, 'product')} />
              {store.dealCount > 0 && <Stat icon="local_offer" text={plural(store.dealCount, 'deal')} accent />}
              <Stat icon="calendar_month" text={`On Yobou since ${new Date(store.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`} />
            </div>
            {store.description && <p className="text-sm text-on-surface-variant leading-relaxed">{store.description}</p>}
          </>
        )}

        {deals.length >= 2 && (
          <ProductRow title="Deals from this store" icon="local_offer" products={deals.slice(0, 10)} onAdd={addToCart} cardWidth={RAIL_CARD} />
        )}

        {store && <StoreProducts storeId={id} categories={store.categories} />}
      </div>
    </div>
  );
}

function Stat({ icon, text, accent }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label-md font-semibold ${accent ? 'bg-sale/10 text-sale' : 'bg-surface-low text-on-surface'}`}>
      <Icon name={icon} className="text-[16px]" /> {text}
    </span>
  );
}

function StoreProducts({ storeId, categories }) {
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState('featured');
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const req = useRef(0);

  async function load(page = 1) {
    const my = ++req.current;
    if (page === 1) setLoading(true);
    const params = new URLSearchParams({ vendor: storeId, sort, page: String(page), pageSize: '24' });
    if (cat) params.set('category', cat);
    try {
      const res = await api(`/api/products?${params}`);
      if (my !== req.current) return;
      setProducts((prev) => (page === 1 ? res.products || [] : [...prev, ...(res.products || [])]));
      setPagination(res.pagination || null);
    } finally {
      if (my === req.current) setLoading(false);
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, [cat, sort, storeId]);

  return (
    <section aria-labelledby="store-all-h" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="store-all-h" className="text-title-lg font-bold">All products</h2>
        {pagination && <span className="text-label-md text-on-surface-variant">{plural(pagination.total, 'result')}</span>}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        <select className="input h-9 py-0 w-auto shrink-0" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {[{ name: '', count: null }, ...categories].map((c) => (
          <button
            key={c.name || 'all'}
            type="button"
            onClick={() => setCat(c.name)}
            className={`shrink-0 h-9 px-3 rounded-full border text-sm font-medium ${cat === c.name ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant/60'}`}
          >
            {c.name || 'All'}{c.count != null && <span className={`ml-1 ${cat === c.name ? 'text-white/80' : 'text-on-surface-variant'}`}>{c.count}</span>}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
      ) : products.length === 0 ? (
        <p className="card p-8 text-center text-on-surface-variant">No products here yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {products.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
          </div>
          {pagination?.hasMore && (
            <div className="text-center">
              <button type="button" className="btn-secondary px-6 py-2.5" onClick={() => load((pagination.page || 1) + 1)}>Show more</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
