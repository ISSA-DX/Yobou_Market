import { useEffect, useState, useRef, useCallback } from 'react';
import Icon from './Icon';

/**
 * Auto-rotating horizontal carousel — Amazon-style "deal of the day"
 * pattern: 12 cards in a horizontal line, one slide-position at a time
 * every few seconds. Manual swipe always wins; auto-advance pauses on
 * hover, touch, and on focus so a screen-reader user reading a card
 * label doesn't lose their place to the next scroll. Honors the
 * `prefers-reduced-motion: reduce` media query by suspending the
 * interval entirely (degrades to a usable manual swipe rail).
 *
 * Implementation notes:
 *   - CSS scroll-snap on the container gives native momentum scrolling
 *     when the user flicks; the JS interval just nudges scrollLeft
 *     forward one card width via smooth-scroll, so transitions blend.
 *   - pause/resume are mutated via a ref, NOT React state, because
 *     the interval callback can fire on a tab where React has
 *     suspended; touching React state from the interval would miss.
 *     Using a ref means setInterval / clearInterval can keep toggling
 *     the flag without re-rendering.
 *   - activeIndex is React state because the dot indicator + arrow
 *     hover-chrome depends on it. The dot indicator is bounded to
 *     Math.min(itemCount, 12) since rendering 12+ dots crowds the row.
 */
export default function AutoCarousel({
  children,
  interval = 4000,
  className = '',
  showDots = true,
  showArrows = true,
  ariaLabel = 'Auto-rotating featured products',
}) {
  // Read the reduced-motion preference once at mount + on change.
  // Reduced-motion disables the interval so the carousel degrades to
  // a usable manual swipe rail. WCAG SC 2.3.3 excludes animations the
  // user explicitly opts out of; honoring the toggle is the right
  // default rather than slowing it down (slow auto-rotation still counts
  // as a vestibular trigger because it shifts without user input).
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setReduceMotion(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);

  const scrollRef = useRef(null);
  // pausedRef is a ref, NOT state, because the interval callback can
  // fire while React hasn't re-rendered with a fresh "paused" prop.
  // Mutations are instant; the effect on re-renders is zero.
  const pausedRef = useRef(false);
  // timerRef tracks the pending setTimeout id from the safety-net
  // pointerup handler so scrollend can cancel a not-yet-fired timer
  // instead of leaving the carousel paused. Lives as a ref (not
  // state) because the timer id is read from a scrollend listener
  // that runs outside React's update cycle.
  const timerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemArr = Array.isArray(children) ? children : [children];
  const itemCount = itemArr.length;

  // Smooth-scroll the container so that the (index)-th card sits at
  // scrollLeft = 0. Uses child offsetLeft (measured post-render) so the
  // math doesn't care about each card's responsive width.
  const scrollToIndex = useCallback((index) => {
    const el = scrollRef.current;
    if (!el) return;
    if (itemCount === 0) return;
    const wrapped = ((index % itemCount) + itemCount) % itemCount;
    const child = el.children[wrapped];
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft, behavior: reduceMotion ? 'auto' : 'smooth' });
    setActiveIndex(wrapped);
  }, [itemCount, reduceMotion]);

  // Auto-advance interval. Skipped when:
  //   - the user has prefers-reduced-motion: reduce
  //   - there's fewer than 2 cards (rotation meaningless)
  // The interval reads `pausedRef.current` so the latest pause/resume
  // decision is always applied without a React re-render.
  useEffect(() => {
    if (reduceMotion) return undefined;
    if (itemCount < 2) return undefined;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setActiveIndex((cur) => {
        const next = cur + 1;
        // Defer the actual scroll by one tick so React can commit the
        // new activeIndex before the scrollTo call reads childWidth.
        requestAnimationFrame(() => scrollToIndex(next));
        return next;
      });
    }, interval);
    return () => clearInterval(id);
  }, [reduceMotion, itemCount, interval, scrollToIndex]);

  // Sync activeIndex with manual swipes. Without this, the dot row
  // and arrow buttons would lose track after a flick.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      const first = el.children[0];
      const stride = first?.offsetWidth || el.clientWidth;
      if (stride === 0) return;
      const idx = Math.round(el.scrollLeft / stride);
      setActiveIndex(((idx % itemCount) + itemCount) % itemCount);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [itemCount]);

  // Scrollend-driven pause-clear + pointerup safety-net timer. On iOS
  // Capacitor WebView the scroll continues with momentum for ~300ms
  // after the finger lifts, so resuming auto-advance at `pointerup`
  // synchronously would have the next interval tick fight the
  // in-flight scroll. scrollend fires after the momentum fully
  // settles, so we use it as the primary resume signal plus a 350ms
  // safety timer wired by onPointerUp so a browser that doesn't
  // dispatch scrollend still recovers.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScrollEnd = () => {
      pausedRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
    el.addEventListener('scrollend', onScrollEnd);
    return () => {
      el.removeEventListener('scrollend', onScrollEnd);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, []);

  return (
    <div
      className={`relative ${className}`}
      // Pause-on-hover + pause-on-pointer + pause-on-keyboard focus.
      // Resuming re-enables auto-advance on the next interval tick.
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onPointerDown={() => { pausedRef.current = true; }}
      // pointerup intentionally does NOT clear pausedRef synchronously.
      // The scrollend listener above is the primary resume signal so
      // auto-advance doesn't fight iOS scroll-momentum. We set a 350
      // ms safety timer here as a fallback for browsers that don't
      // dispatch scrollend (and to recover from a stuck touch).
      onPointerUp={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          pausedRef.current = false;
          timerRef.current = null;
        }, 350);
      }}
      onFocusCapture={() => { pausedRef.current = true; }}
      onBlurCapture={() => { pausedRef.current = false; }}
    >
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory"
        role="region"
        aria-label={ariaLabel}
        aria-roledescription="carousel"
      >
        {itemArr.map((child, i) => (
          <div key={i} className="snap-start shrink-0 w-[170px] sm:w-[200px]" aria-roledescription="slide" aria-label={`Slide ${i + 1} of ${itemCount}`}>
            {child}
          </div>
        ))}
      </div>

      {showArrows && itemCount > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous featured product"
            onClick={() => scrollToIndex(activeIndex - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur shadow-card flex items-center justify-center hover:bg-white transition-opacity opacity-70 hover:opacity-100"
          >
            <Icon name="chevron_left" />
          </button>
          <button
            type="button"
            aria-label="Next featured product"
            onClick={() => scrollToIndex(activeIndex + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 backdrop-blur shadow-card flex items-center justify-center hover:bg-white transition-opacity opacity-70 hover:opacity-100"
          >
            <Icon name="chevron_right" />
          </button>
        </>
      )}

      {showDots && itemCount > 1 && (
        <div className="flex justify-center gap-1.5 mt-2" aria-hidden="true">
          {Array.from({ length: Math.min(itemCount, 12) }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Show featured product ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-4 bg-primary' : 'w-1.5 bg-outline-variant hover:bg-on-surface-variant'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
