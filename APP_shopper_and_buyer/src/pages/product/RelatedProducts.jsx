// RelatedProducts — "Customers also viewed" rail below the PDP tabs.
//
// Fetches GET /api/products/:id/related which returns up to N LIVE
// products in the same category, sorted with in-stock items first.
// Subscribes to the catalog SSE stream so an admin/vendor delete of a
// related product drops it from the rail live (no manual refresh).
//
// Returns null when the response is empty — this happens whenever the
// category only has the current product, and silently hiding the
// section is the right call.
import { useApi, RetryError } from '../../useApi.jsx';
import ProductCard from '../../components/ProductCard';
import Icon from '../../components/Icon';
import { useProductLiveSync } from '../../lib/useProductLiveSync';

export default function RelatedProducts({ productId, onAdd, excludeId }) {
  const { data, error, loading, refetch } = useApi(`/api/products/${productId}/related`);

  // The related endpoint is a snapshot at request time. We refetch on
  // any product change so the rail stays in sync with admin/vendor
  // edits and deletes. The kinds Set in useProductLiveSync handles the
  // new/updated/deleted events the server fans out.
  useProductLiveSync(refetch, {
    match: (frame) => {
      // Only refetch when the event is about a product — the endpoint
      // ignores category changes (the rail is a same-category list and
      // the response is per-category, so a category rename would
      // require a manual refetch on the parent page, not here).
      if (frame?.productId && frame.productId === productId) return true;
      // For unrelated products we still want to refresh — the rail may
      // include products that just got deleted, or the target category
      // may have new arrivals.
      return true;
    },
  });

  const products = data?.products || [];
  const visible = excludeId ? products.filter((p) => p.id !== excludeId) : products;

  if (loading && !data) {
    return (
      <section className="px-4 pt-2 pb-6" aria-label="Customers also viewed">
        <h2 className="text-title-md font-bold mb-3">Customers also viewed</h2>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-44 sm:w-52 shrink-0">
              <ProductCardSkeletonInline />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="px-4 pt-2 pb-6">
        <RetryError message="Couldn't load related products." onRetry={refetch} />
      </section>
    );
  }

  if (visible.length === 0) return null;

  return (
    <section className="px-4 pt-4 pb-6" aria-label="Customers also viewed">
      <h2 className="text-title-md font-bold mb-3 flex items-center gap-2">
        <Icon name="people" className="text-[20px] text-primary" />
        Customers also viewed
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'thin' }}
      >
        {visible.map((p) => (
          <div key={p.id} className="w-44 sm:w-52 shrink-0 snap-start">
            <ProductCard product={p} onAdd={onAdd} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductCardSkeletonInline() {
  return (
    <div className="bg-white rounded-lg border border-outline-variant/20 shadow-card overflow-hidden flex flex-col">
      <div className="aspect-square bg-surface-low animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-surface-low rounded animate-pulse w-2/3" />
        <div className="h-4 bg-surface-low rounded animate-pulse w-3/4" />
        <div className="h-5 bg-surface-low rounded animate-pulse w-1/2" />
        <div className="h-9 bg-surface-low rounded-full animate-pulse" />
      </div>
    </div>
  );
}
