// useProductLiveSync — list-page subscription to catalog SSE events (shopper).
// Source of truth: Internal_Web_Admin/src/lib/useProductLiveSync.js
// (identical, kept in sync).
//
// Shopper pages subscribe so /home, /categories, /categories/:slug,
// /search, and /products/:id stay in sync after any admin/vendor
// create/update/delete — no manual refresh required.
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