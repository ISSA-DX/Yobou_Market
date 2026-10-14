import Icon from './Icon';

// KPI tile — identical in Internal_Web_Admin and Partner_Web_Vendor.
// `delta` is an optional "+12%" / "-3%" string; `hint` a small caption.
const TONES = {
  primary: 'bg-primary/10 text-primary',
  tertiary: 'bg-emerald-50 text-emerald-700',
  secondary: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
};

export default function KPICard({ label, value, delta, hint, icon, tone = 'primary' }) {
  const up = typeof delta === 'string' && delta.trim().startsWith('+');
  return (
    <div className="bento card-hover relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="text-label-md font-semibold text-on-surface-variant leading-snug">{label}</div>
        <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${TONES[tone] || TONES.primary}`}>
          <Icon name={icon} className="text-[20px]" />
        </div>
      </div>
      <div className="mt-2 text-[28px] leading-9 font-extrabold tracking-tight text-on-surface tabular-nums">{value}</div>
      {(delta || hint) && (
        <div className="mt-1.5 flex items-center gap-2 text-label-md">
          {delta && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              <Icon name={up ? 'trending_up' : 'trending_down'} className="text-[14px]" />
              {delta}
            </span>
          )}
          {hint && <span className="text-on-surface-variant">{hint}</span>}
        </div>
      )}
    </div>
  );
}
