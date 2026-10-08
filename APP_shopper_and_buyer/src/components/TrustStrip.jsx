import Icon from './Icon';

const TRUST_SIGNALS = [
  { icon: 'verified_user', label: 'Secure checkout', desc: 'Encrypted payments' },
  { icon: 'local_shipping', label: 'Fast delivery', desc: 'Free over $50' },
  { icon: 'payments', label: 'M-Pesa / MoMo', desc: 'Mobile money accepted' },
  { icon: 'sync_alt', label: 'Easy returns', desc: '30-day policy' },
  { icon: 'support_agent', label: '24/7 support', desc: 'Always here' },
];

/**
 * Horizontal trust strip placed high on the homepage.
 * Gives shoppers the confidence signals that reduce homepage bounce
 * (inspired by Jumia, AliExpress, and Shopify storefront patterns).
 */
export default function TrustStrip() {
  return (
    <div className="relative -mx-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth px-4 pb-1">
        {TRUST_SIGNALS.map((s) => (
          <div
            key={s.label}
            className="snap-start flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-outline-variant/20 shadow-sm min-w-[150px]"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Icon name={s.icon} className="text-[18px] text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-on-surface leading-tight">{s.label}</div>
              <div className="text-[10px] text-on-surface-variant leading-tight">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
