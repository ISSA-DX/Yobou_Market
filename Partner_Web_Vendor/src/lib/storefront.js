// Where the customer-facing app lives, for "View my store" style links.
//   VITE_SHOPPER_BASE — full URL of the shopper app (trailing slash).
const SHOPPER = import.meta.env.VITE_SHOPPER_BASE || 'https://issa-dx.github.io/Yobou_Market/';

export const storeUrl = (vendorId) => `${SHOPPER}stores/${vendorId}`;
export const productUrl = (productId) => `${SHOPPER}product/${productId}`;
