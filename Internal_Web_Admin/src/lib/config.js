// Tiny config module — exposes build-time env vars with sensible
// defaults so a deploy can be redirected without a code change.
//
//   VITE_API_BASE       — full URL of the API (e.g. https://yobou-api.onrender.com)
//                         Leave empty in dev so Vite's proxy kicks in.
//   VITE_SHOPPER_BASE   — full URL of the customer-facing app
//                         (e.g. https://issa-dx.github.io/Yobou_Market/).
//                         Used for deep links to the storefront.
//   VITE_PARTNER_BASE   — full URL of the vendor portal app
//                         (e.g. https://issa-dx.github.io/Yobou_Market/partner/).
//                         Used for deep links to the vendor's own dashboard.
const API = import.meta.env.VITE_API_BASE || '';
const SHOPPER = import.meta.env.VITE_SHOPPER_BASE || 'https://issa-dx.github.io/Yobou_Market/';
const PARTNER = import.meta.env.VITE_PARTNER_BASE || 'https://issa-dx.github.io/Yobou_Market/partner/';

export const config = {
  apiBase: API,
  shopperBase: SHOPPER,
  partnerBase: PARTNER,
};

export function shopperProductUrl(productId) {
  return `${SHOPPER}product/${productId}`;
}

export function shopperCategoryUrl(category) {
  return `${SHOPPER}categories/${encodeURIComponent(category)}`;
}

export function shopperHomeUrl() {
  return SHOPPER;
}

export function partnerProductUrl(productId) {
  // Vendor portal reads `?product=<id>` so the deep link lands the vendor
  // on their product edit page directly.
  return `${PARTNER}products/${productId}/edit`;
}

export function partnerProductsUrl() {
  return `${PARTNER}products`;
}