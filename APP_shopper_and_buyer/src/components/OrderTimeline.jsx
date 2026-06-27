import Icon from './Icon';

const STEPS = [
  { key: 'PLACED', label: 'Order placed', icon: 'check_circle' },
  { key: 'PAID', label: 'Payment confirmed', icon: 'payments' },
  { key: 'PROCESSING', label: 'Being prepared', icon: 'inventory_2' },
  { key: 'SHIPPED', label: 'On the way', icon: 'local_shipping' },
  { key: 'DELIVERED', label: 'Delivered', icon: 'task_alt' },
];

export default function OrderTimeline({ currentStatus, events = [] }) {
  const reached = new Set(events.map((e) => e.status));
  // Make sure current is at least present.
  reached.add(currentStatus);
  const cancelled = currentStatus === 'CANCELLED';

  return (
    <ol className="space-y-3">
      {STEPS.map((step, i) => {
        const done = reached.has(step.key) && !cancelled;
        const active = currentStatus === step.key && !cancelled;
        return (
          <li key={step.key} className="relative flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                done
                  ? 'bg-tertiary-container text-white'
                  : active
                  ? 'bg-primary text-white animate-pulse'
                  : 'bg-surface-high text-on-surface-variant'
              }`}
            >
              <Icon name={step.icon} className="text-[18px]" fill={done} />
            </div>
            <div className="pt-1.5 flex-1">
              <div className={`text-sm font-semibold ${done || active ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                {step.label}
              </div>
              {done && (
                <div className="text-label-sm text-on-surface-variant">
                  {(() => {
                    const e = events.find((e) => e.status === step.key);
                    return e?.at ? new Date(e.at).toLocaleString() : '';
                  })()}
                </div>
              )}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`absolute left-[18px] mt-9 w-0.5 h-3 ${done ? 'bg-tertiary-container' : 'bg-surface-high'}`} />
            )}
          </li>
        );
      })}
      {cancelled && (
        <li className="flex items-start gap-3 pt-2">
          <div className="w-9 h-9 rounded-full bg-error text-white flex items-center justify-center">
            <Icon name="block" className="text-[18px]" />
          </div>
          <div className="pt-1.5">
            <div className="text-sm font-semibold text-error">Order cancelled</div>
            <div className="text-label-sm text-on-surface-variant">Payment was declined.</div>
          </div>
        </li>
      )}
    </ol>
  );
}