import { useState } from 'react';
import Icon from './Icon';

// Reusable card form — used in both "Add to wallet" and "Pay now" flows.
export default function CardForm({ onSubmit, submitLabel = 'Save Card', ctaSuffix }) {
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' });
  const [save, setSave] = useState(true);
  const [busy, setBusy] = useState(false);

  function format(v) {
    return v.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})/g, '$1 ').trim();
  }
  function fmtExpiry(v) {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length < 3) return digits;
    return digits.slice(0, 2) + '/' + digits.slice(2);
  }

  function update(k, v) {
    setCard((c) => ({ ...c, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit({ ...card, save });
    } finally {
      setBusy(false);
    }
  }

  const cta = ctaSuffix ? `${submitLabel} · ${ctaSuffix}` : submitLabel;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Visual card preview */}
      <div className="relative w-full aspect-[1.586] rounded-xl overflow-hidden shadow-float bg-gradient-to-br from-primary to-primary-container text-white p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div className="w-10 h-7 rounded-sm bg-white/30" />
          <Icon name="contactless" className="text-[24px]" />
        </div>
        <div>
          <div className="font-mono text-lg tracking-widest">{card.number || '•••• •••• •••• ••••'}</div>
          <div className="mt-2 flex justify-between text-label-md">
            <div>
              <div className="opacity-70">CARD HOLDER</div>
              <div className="font-semibold">{card.name || 'YOUR NAME'}</div>
            </div>
            <div>
              <div className="opacity-70">EXPIRES</div>
              <div className="font-semibold">{card.expiry || 'MM/YY'}</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="text-label-md text-on-surface-variant">Card number</label>
        <input
          className="input mt-1 font-mono"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={card.number}
          onChange={(e) => update('number', format(e.target.value))}
          required
        />
      </div>
      <div>
        <label className="text-label-md text-on-surface-variant">Cardholder name</label>
        <input
          className="input mt-1"
          autoComplete="cc-name"
          placeholder="As shown on card"
          value={card.name}
          onChange={(e) => update('name', e.target.value.toUpperCase())}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-label-md text-on-surface-variant">Expiry</label>
          <input
            className="input mt-1 font-mono"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={card.expiry}
            onChange={(e) => update('expiry', fmtExpiry(e.target.value))}
            required
          />
        </div>
        <div>
          <label className="text-label-md text-on-surface-variant">CVV</label>
          <input
            className="input mt-1 font-mono"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            maxLength={4}
            value={card.cvv}
            onChange={(e) => update('cvv', e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={save}
          onChange={(e) => setSave(e.target.checked)}
          className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary"
        />
        Save card to my wallet for faster checkout
      </label>

      <div className="flex items-center gap-3 text-label-md text-on-surface-variant">
        <Icon name="lock" className="text-[16px]" />
        <span>256-bit encryption · PCI-DSS secured</span>
      </div>

      <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">
        {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
        {cta}
      </button>
    </form>
  );
}