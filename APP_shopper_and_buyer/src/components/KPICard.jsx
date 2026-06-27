import Icon from './Icon';

export default function KPICard({ label, value, delta, icon, tone = 'primary' }) {
  const toneMap = {
    primary: 'bg-primary/10 text-primary',
    tertiary: 'bg-tertiary-container/20 text-tertiary',
    secondary: 'bg-secondary/20 text-secondary',
  };
  return (
    <div className="bento">
      <div className="flex items-start justify-between">
        <div className="text-label-md uppercase tracking-wide text-on-surface-variant">{label}</div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${toneMap[tone] || toneMap.primary}`}>
          <Icon name={icon} className="text-[20px]" />
        </div>
      </div>
      <div className="mt-3 text-headline-md font-bold text-on-surface">{value}</div>
      {delta && (
        <div className="mt-1 text-label-md text-on-surface-variant flex items-center gap-1">
          <Icon name={delta.startsWith('+') ? 'trending_up' : 'trending_down'} className="text-[14px]" />
          {delta}
        </div>
      )}
    </div>
  );
}