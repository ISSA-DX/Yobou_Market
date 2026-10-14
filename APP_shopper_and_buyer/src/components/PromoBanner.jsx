import { useState } from 'react';
import Icon from './Icon';

/**
 * Dismissible app-exclusive coupon banner.
 * - Shown near the top of the home feed to create urgency and reward
 *   shoppers who use the app, a pattern used heavily by AliExpress, Temu,
 *   and Shein.
 * - Dismissal is persisted in sessionStorage so a tap back keeps the state.
 */
export default function PromoBanner({ code = 'YOBAPP20', discount = '20% off' }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('yobou-promo-dismissed') === '1';
  });

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('yobou-promo-dismissed', '1');
    }
  }

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-tertiary to-tertiary-container text-white p-4 shadow-md">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2 right-2 p-1 rounded-full bg-white/15 hover:bg-white/25 transition"
        aria-label="Dismiss promotion"
      >
        <Icon name="close" className="text-[16px]" />
      </button>

      <div className="relative z-10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <Icon name="card_giftcard" className="text-[22px]" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide opacity-90">App exclusive</div>
          <div className="text-sm sm:text-base font-bold leading-tight">
            {discount} with code <span className="inline-block px-1.5 py-0.5 rounded bg-white/20 font-mono text-[13px]">{code}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
