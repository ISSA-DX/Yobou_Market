// Horizontal product rail. Phones swipe it; laptops get previous/next
// arrow buttons (mouse users can't swipe, and the scrollbar is hidden).
// `className` styles the scrolling row itself, so reveal-stagger classes
// and bleed padding (-mx-4 px-4) work exactly as on a plain div.
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// Card width inside rails — one token so every rail lines up.
export const RAIL_ITEM = 'shrink-0 w-[170px] sm:w-[200px] lg:w-[214px]';

export default function Rail({ children, className = '', label = 'products' }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [update]);
  // Content can arrive after mount (data loads).
  useEffect(update, [children, update]);

  const page = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.85), behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div ref={ref} className={`flex overflow-x-auto no-scrollbar scroll-smooth ${className}`}>
        {children}
      </div>
      {!edge.start && <Arrow side="left" label={`Previous ${label}`} onClick={() => page(-1)} />}
      {!edge.end && <Arrow side="right" label={`More ${label}`} onClick={() => page(1)} />}
    </div>
  );
}

function Arrow({ side, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`hidden lg:flex absolute top-[38%] -translate-y-1/2 ${side === 'left' ? 'left-1' : 'right-1'} z-10 w-11 h-11 rounded-full bg-white text-on-surface shadow-elevation-3 ring-1 ring-black/5 items-center justify-center hover:bg-surface-low transition-colors`}
    >
      <Icon name={side === 'left' ? 'chevron_left' : 'chevron_right'} className="text-[26px]" />
    </button>
  );
}
