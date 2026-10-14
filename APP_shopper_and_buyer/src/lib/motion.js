// Motion system runtime — pairs with src/styles/motion.css.
//
// enableMotion(): call once before the first render. Turns on the
//   "hidden until revealed" CSS only when it can work (IntersectionObserver
//   available) and is wanted (no prefers-reduced-motion). Otherwise every
//   section simply renders normally.
// useScrollReveal(): mount once at the app root. Watches every .reveal /
//   .reveal-stagger element — including ones React adds later — and marks
//   it .is-visible the first time it enters the viewport.
import { useEffect } from 'react';

const SELECTOR = '.reveal:not(.is-visible), .reveal-stagger:not(.is-visible)';

function motionAllowed() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function enableMotion() {
  if (motionAllowed()) document.documentElement.classList.add('motion-ready');
}

export function useScrollReveal() {
  useEffect(() => {
    if (!document.documentElement.classList.contains('motion-ready')) return undefined;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      // threshold 0: tall containers (whole lists) must trigger as soon as
      // they touch the viewport, not when a % of their area is visible.
      { rootMargin: '0px 0px -40px 0px', threshold: 0 },
    );

    // Safety net: never leave content hidden. Anything already in or
    // above the viewport (e.g. after a fast fling or an anchor jump) is
    // revealed on scroll/resize and on a short timer, independent of the
    // observer's timing.
    const sweep = () => {
      const limit = window.innerHeight;
      document.querySelectorAll(SELECTOR).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < limit && (r.bottom > 0 || r.top < 0)) {
          el.classList.add('is-visible');
          io.unobserve(el);
        }
      });
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; sweep(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    const timer = setInterval(sweep, 800);

    const scan = (root) => {
      if (root.nodeType !== 1) return;
      if (root.matches?.(SELECTOR)) io.observe(root);
      root.querySelectorAll?.(SELECTOR).forEach((el) => io.observe(el));
    };
    scan(document.body);

    // Pages render asynchronously (lazy routes, API data) — pick up new nodes.
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach(scan);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      clearInterval(timer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}

// Restart a one-shot micro-interaction class (e.g. 'anim-heart') on an element.
export function replayAnimation(el, className) {
  if (!el || !document.documentElement.classList.contains('motion-ready')) return;
  el.classList.remove(className);
  // Force reflow so the browser restarts the animation.
  void el.offsetWidth;
  el.classList.add(className);
}
