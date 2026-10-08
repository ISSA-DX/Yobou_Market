// useRecentlyViewed
// ---------------------------------------------------------------------------
// Local-only "recently viewed products" list. Backed by localStorage so
// the rail works for guests (no auth required) and persists across app
// restarts. We never call the server; on render we filter the public
// /api/products list to just the saved IDs, same pattern as the wishlist.
//
// Cap at 12 entries so the localStorage footprint stays trivial and the
// rail doesn't become a long scroll of low-signal items.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'yobou:recently-viewed';
const CAP = 12;

function read() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, CAP) : [];
  } catch {
    return [];
  }
}

function write(ids) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, CAP)));
  } catch { /* quota / private mode — ignore */ }
}

export function useRecentlyViewed() {
  // Initialise lazily on first render so SSR (if ever) doesn't blow up.
  const [ids, setIds] = useState(read);

  // Re-sync if a different tab updates the list. Without this the rail
  // would feel stale when the user opens a product in one tab and the
  // Home tab doesn't refresh.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== KEY) return;
      setIds(read());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const track = useCallback((id) => {
    if (!id) return;
    setIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, CAP);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, []);

  return { ids, track, clear };
}
