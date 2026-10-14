import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useStore } from '../../store';

/**
 * Swipeable hero carousel with auto-advance and dot indicators.
 * - `slides` is an array of { title, subtitle, cta, to, gradient, icon }.
 * - Auto-advances every 5s; pauses while the user is interacting.
 * - Respects prefers-reduced-motion.
 */
export default function HeroCarousel({ slides = [] }) {
  const dataSaver = useStore((s) => s.dataSaver);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else if (mq.removeListener) mq.removeListener(handler);
    };
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length <= 1 || paused || dataSaver) return;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 5000);
  }, [slides.length, paused, dataSaver]);

  const goTo = useCallback((i) => {
    setIndex(i);
    setPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => setPaused(false), 3000);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % slides.length);
  }, [slides.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  function onTouchStart(e) {
    setTouchStart(e.changedTouches[0].clientX);
    setPaused(true);
  }

  function onTouchEnd(e) {
    if (touchStart == null) return;
    const delta = e.changedTouches[0].clientX - touchStart;
    const abs = Math.abs(delta);
    if (abs > 40) {
      if (delta < 0) next();
      else prev();
      // Reset auto-advance after a manual swipe.
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => setPaused(false), 3000);
    } else {
      setPaused(false);
    }
    setTouchStart(null);
  }

  if (slides.length === 0) return null;

  return (
    <section
      className="relative -mx-4 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex"
        style={{
          transform: `translateX(-${index * 100}%)`,
          transition: reducedMotion ? 'none' : 'transform 500ms ease-out',
        }}
      >
        {slides.map((slide) => (
          <Link
            key={slide.to + slide.title}
            to={slide.to}
            className="min-w-full px-4"
          >
            <div className={`card p-5 relative overflow-hidden text-white bg-gradient-to-br ${slide.gradient} min-h-[180px] flex flex-col justify-center`}>
              <div className="relative z-10 max-w-[70%] sm:max-w-[60%]">
                <div className="chip bg-white/15 text-white border-0 mb-2 text-[11px]">
                  {slide.tag && <Icon name={slide.tagIcon || 'campaign'} className="text-[14px]" />}
                  {slide.tag || 'Promotion'}
                </div>
                <h2 className="text-headline-lg font-bold leading-tight">{slide.title}</h2>
                {slide.subtitle && <p className="mt-1 text-sm opacity-90 line-clamp">{slide.subtitle}</p>}
                {slide.cta && (
                  <span className="mt-3 inline-block bg-white text-on-surface font-semibold px-4 py-2 rounded-full text-sm">
                    {slide.cta}
                  </span>
                )}
              </div>
              <div className="absolute -right-4 -bottom-6 w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-white/10 flex items-center justify-center">
                <Icon name={slide.icon} className="text-[72px] sm:text-[88px] text-white/30" fill />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition ${i === index ? 'bg-primary w-4' : 'bg-outline-variant w-2'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
