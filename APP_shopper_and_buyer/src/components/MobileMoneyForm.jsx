import Icon from './Icon';

const PROVIDERS = [
  { id: 'MPESA', label: 'M-Pesa', color: 'bg-green-600' },
  { id: 'MTN', label: 'MTN Mobile Money', color: 'bg-yellow-500' },
  { id: 'AIRTEL', label: 'Airtel Money', color: 'bg-red-600' },
  { id: 'ORANGE', label: 'Orange Money', color: 'bg-orange-500' },
  { id: 'MOBICASH', label: 'MobiCash', color: 'bg-violet-600' },
  { id: 'ORANGE_MONEY', label: 'Orange Money Mali', color: 'bg-orange-600' },
];

const COUNTRIES = [
  { code: 'KE', name: 'Kenya' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'UG', name: 'Uganda' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'CI', name: 'Côte d\'Ivoire' },
  { code: 'SN', name: 'Senegal' },
  { code: 'ZA', name: 'South Africa' },
];

/**
 * Mobile-money checkout form.
 * - Provider selection chips
 * - Country select
 * - Phone input with numeric-friendly keyboard
 * - No PIN / OTP field — those are entered on the customer's phone only.
 */
export default function MobileMoneyForm({ value, onChange }) {
  function update(field, v) {
    onChange({ ...value, [field]: v });
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="space-y-2">
        <span className="text-label-md font-bold text-on-surface">Select provider</span>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => {
            const active = value.provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => update('provider', p.id)}
                className={`flex items-center gap-2 p-2.5 rounded-lg border transition ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-outline-variant/40 bg-white hover:border-primary/40'
                }`}
              >
                <div className={`w-3 h-3 rounded-full ${p.color}`} />
                <span className="text-sm font-semibold text-on-surface">{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="mm-country" className="text-label-md font-bold text-on-surface">Country</label>
        <select
          id="mm-country"
          value={value.country}
          onChange={(e) => update('country', e.target.value)}
          className="input w-full"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="mm-phone" className="text-label-md font-bold text-on-surface">Mobile number</label>
        <div className="relative">
          <Icon name="phone_iphone" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
          <input
            id="mm-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 254712345678"
            value={value.phone}
            onChange={(e) => update('phone', e.target.value)}
            className="input w-full pl-10"
          />
        </div>
        <p className="text-xs text-on-surface-variant">You will receive a prompt on this phone to approve payment. We never store your PIN.</p>
      </div>
    </div>
  );
}
