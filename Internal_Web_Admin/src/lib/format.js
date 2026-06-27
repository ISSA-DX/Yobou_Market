// Currency formatting helpers driven by the user's saved preference.

export const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', locale: 'de-DE' },
  { code: 'GBP', name: 'British Pound', locale: 'en-GB' },
  { code: 'CAD', name: 'Canadian Dollar', locale: 'en-CA' },
  { code: 'XOF', name: 'West African CFA Franc', locale: 'fr-FR' },
  { code: 'CNY', name: 'Chinese Yuan', locale: 'zh-CN' },
];

const ZERO_DECIMAL = new Set(['XOF', 'JPY', 'KRW', 'VND', 'CLP']);

export function isZeroDecimalCurrency(currency) {
  return ZERO_DECIMAL.has(currency?.toUpperCase());
}

function getLocale(currency, language) {
  const found = CURRENCIES.find((c) => c.code === currency);
  if (language) {
    const region = (found?.locale || 'en-US').split('-')[1] || 'US';
    return `${language}-${region}`;
  }
  return found?.locale || 'en-US';
}

export function formatPrice(cents, currency = 'USD', language) {
  const useMinor = isZeroDecimalCurrency(currency);
  const value = useMinor ? (cents || 0) : (cents || 0) / 100;
  const locale = getLocale(currency, language);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: useMinor ? 0 : 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(useMinor ? 0 : 2)}`;
  }
}

export function userLocale(language) {
  const found = LANGUAGES.find((l) => l.code === language);
  return found ? found.code : 'en';
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'zh', name: '中文' },
];