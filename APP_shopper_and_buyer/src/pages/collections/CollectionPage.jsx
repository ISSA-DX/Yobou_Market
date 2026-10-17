// Curated collection page — /collections/:slug
// Built by admins in Admin → Categories → Collections; the same products
// appear as a rail on the category page. Data: GET /api/collections/:slug
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import { useApi } from '../../useApi.jsx';
import { useStore } from '../../store';
import { toast } from '../../lib/toast';
import { themeFor, categoryPath } from '../../lib/categoryTheme';
import { plural } from '../../lib/categoryFormat';

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

export default function CollectionPage() {
  const { slug } = useParams();
  const { data, error, refetch } = useApi(`/api/collections/${encodeURIComponent(slug)}`);
  const c = data?.collection;
  const t = themeFor({ name: c?.category });

  useEffect(() => { window.scrollTo({ top: 0 }); }, [slug]);

  if (error && !data) {
    const missing = error?.status === 404;
    return (
      <div className="px-4 py-16 text-center text-on-surface-variant">
        <Icon name={missing ? 'collections_bookmark' : 'cloud_off'} className="text-[44px]" />
        <p className="text-title-md font-medium text-on-surface mt-2">{missing ? 'This collection has ended' : 'Could not load this collection'}</p>
        <div className="mt-4 flex justify-center gap-2">
          {!missing && <button type="button" className="btn-primary px-5 py-2" onClick={refetch}>Try again</button>}
          <Link to="/categories" className="btn-secondary px-5 py-2">Browse categories</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8 lg:pt-6 lg:px-4">
      <header className={`relative overflow-hidden bg-gradient-to-br ${t.gradient} text-white lg:rounded-3xl`}>
        <div className="relative z-10 px-4 pt-3 pb-6 lg:px-10 lg:pt-6 lg:pb-10">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-label-md text-white/80 mb-3 min-w-0">
            <Link to={c ? categoryPath({ name: c.category }) : '/categories'} className="p-2 -ml-2 rounded-full hover:bg-white/20 shrink-0" aria-label="Back">
              <Icon name="arrow_back" className="text-[22px] text-white" />
            </Link>
            {c && (
              <>
                <Link to={categoryPath({ name: c.category })} className="hover:text-white truncate">{c.category}</Link>
                {c.subcategory && (
                  <>
                    <Icon name="chevron_right" className="text-[16px] shrink-0" />
                    <Link to={categoryPath({ name: c.category }, { name: c.subcategory })} className="hover:text-white truncate">{c.subcategory}</Link>
                  </>
                )}
              </>
            )}
          </nav>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-label-sm font-bold uppercase tracking-wide">
            <Icon name="collections_bookmark" className="text-[14px]" /> Collection
          </div>
          {/* text-white overrides the global h1 colour on the gradient. */}
          <h1 className="mt-2 text-headline-md font-extrabold text-white leading-tight">{c?.name || ' '}</h1>
          {c?.description && <p className="text-sm text-white/90 mt-1 max-w-xl">{c.description}</p>}
          {c && <p className="mt-3 text-label-md text-white/85">{plural(c.products.length, 'product')}</p>}
        </div>
        <Icon name="collections_bookmark" className="absolute -right-6 -bottom-10 text-[150px] opacity-15" />
      </header>

      <div className="px-4 pt-4 lg:px-0 lg:pt-8">
        {!c ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
        ) : c.products.length === 0 ? (
          <p className="card p-8 text-center text-on-surface-variant">Nothing in this collection right now.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {c.products.map((p) => <ProductCard key={p.id} product={p} onAdd={addToCart} />)}
          </div>
        )}
      </div>
    </div>
  );
}
