// useProductLiveSync — list-page subscription to catalog SSE events.
//
// Wires useCatalogStream to the local refetch. The server fires `product_*`
// and `category_*` frames whenever an admin or vendor mutates the catalog;
// list pages call this hook to refetch on the matching kinds so the page
// updates without a manual refresh.
//
// The optional `match` predicate lets pages filter on meta — e.g. the
// product-details page passes `match: (f) => f.productId === productId`
// so unrelated changes don't cause a refetch storm.
//
// Source of truth copied identically across the three apps (each is its
// own bundle).
import { useEffect, useRef } from 'react';
import { useCatalogStream } from './useSse';

const PRODUCT_KINDS = new Set(['product_created', 'product_updated', 'product_deleted']);
const CATEGORY_KINDS = new Set(['category_created', 'category_updated', 'category_archived', 'category_deleted']);

export function useProductLiveSync(refetch, opts = {}) {
  const { match, kinds, alsoCategories = false } = opts;
  const ref = useRef({ refetch, match, kinds, alsoCategories });
  ref.current = { refetch, match, kinds, alsoCategories };

  useEffect(() => {
    return useCatalogStream((frame) => {
      const event = frame?.event;
      if (!event) return;
      const okKinds = ref.current.kinds
        || (ref.current.alsoCategories
              ? new Set([...PRODUCT_KINDS, ...CATEGORY_KINDS])
              : PRODUCT_KINDS);
      if (!okKinds.has(event)) return;
      if (ref.current.match && !ref.current.match(frame)) return;
      try { ref.current.refetch?.(); } catch { /* ignore */ }
    });
  }, []);
}