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
//
// IMPORTANT: hooks MUST be called during render, not from inside another
// hook's useEffect callback. Earlier versions called useCatalogStream
// inside useEffect(() => ..., []) which is a Rules of Hooks violation
// and caused React #321 "Maximum update depth exceeded" on /products
// in production. We call useCatalogStream at the top level of this hook
// and let it register the subscription via its own useEffect.
import { useCallback, useRef } from 'react';
import { useCatalogStream } from './useSse';

const PRODUCT_KINDS = new Set(['product_created', 'product_updated', 'product_deleted']);
const CATEGORY_KINDS = new Set(['category_created', 'category_updated', 'category_archived', 'category_deleted']);

export function useProductLiveSync(refetch, opts = {}) {
  const { match, kinds, alsoCategories = false } = opts;

  // Keep the latest callbacks in a ref so the subscriber identity is
  // stable and the SSE wrapper doesn't unsubscribe/resubscribe on every
  // render. Without this, useCatalogStream's useEffect cleanup would
  // tear down + rebuild the SSE EventSource on every parent render.
  const ref = useRef({ refetch, match, kinds, alsoCategories });
  ref.current = { refetch, match, kinds, alsoCategories };

  // Stable wrapper — only depends on the kind list, which is a constant
  // module-level Set reference. useCatalogStream's useEffect([deps]) will
  // therefore only fire once on mount.
  const onFrame = useCallback((frame) => {
    const event = frame?.event;
    if (!event) return;
    const { refetch: r, match: m, kinds: ks, alsoCategories: ac } = ref.current;
    const okKinds = ks
      || (ac ? new Set([...PRODUCT_KINDS, ...CATEGORY_KINDS]) : PRODUCT_KINDS);
    if (!okKinds.has(event)) return;
    if (m && !m(frame)) return;
    try { r?.(); } catch { /* ignore */ }
  }, []);

  useCatalogStream(onFrame);
}