// Live CSS media-query match. Used to mount desktop-only chrome (header,
// footer) only on wide screens, so phones don't pay for its data loads.
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Tailwind `lg` (1024px): the laptop/desktop layout.
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
