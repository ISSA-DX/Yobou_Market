import { useEffect, useMemo, useState } from 'react';

/**
 * Compact urgency timer.
 * - `target` is an ISO date string; defaults to the end of the current day.
 * - `prefix` is the text before the remaining time.
 * - Respects prefers-reduced-motion by ticking once per minute instead of
 *   once per second for users who opt out of motion.
 */
export default function CountdownTimer({ target, prefix = 'Ends in' }) {
  const end = useMemo(() => {
    if (target) return new Date(target);
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, [target]);

  const [reducedMotion, setReducedMotion] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    const ms = reducedMotion ? 60_000 : 1_000;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [reducedMotion]);

  const remaining = Math.max(0, end.getTime() - now);
  if (remaining === 0) return null;

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/10 text-error text-[11px] font-bold"
      aria-live={reducedMotion ? 'off' : 'polite'}
    >
      {prefix} {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}
