import { useState } from 'react';
import Icon from './Icon';

const METHODS = [
  { id: 'CARD', label: 'Credit / Debit card', icon: 'credit_card', sub: 'Visa, Mastercard, Amex' },
  { id: 'PAYPAL', label: 'PayPal', icon: 'account_balance_wallet', sub: 'You will be redirected' },
  { id: 'COD', label: 'Cash on Delivery', icon: 'local_shipping', sub: 'Pay when your order arrives' },
];

export default function PaymentMethodPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      {METHODS.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`w-full flex items-center gap-3 p-4 rounded-lg border transition ${
              active
                ? 'border-primary bg-primary/5'
                : 'border-outline-variant/40 bg-white hover:border-primary/40'
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? 'bg-primary text-white' : 'bg-surface-high text-on-surface-variant'}`}>
              <Icon name={m.icon} className="text-[22px]" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-on-surface">{m.label}</div>
              <div className="text-label-md text-on-surface-variant">{m.sub}</div>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-primary' : 'border-outline-variant'}`}>
              {active && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export { METHODS as PAYMENT_METHODS };
export function PaymentMethodDisplay({ method }) {
  const m = METHODS.find((x) => x.id === method);
  if (!m) return null;
  return (
    <div className="flex items-center gap-2">
      <Icon name={m.icon} className="text-[18px] text-primary" />
      <span className="text-sm font-medium">{m.label}</span>
    </div>
  );
}