// Resolve the best image URL for a product. The product's imageUrls column
// is a JSON string stored by the server (Prisma + SQLite has no native
// array, so we serialize). We fall back to the bundled SVG set in
// Partner_Web_Vendor/public/seed-images so the partner app always has
// something to render.
//
// Vite's `base: '/partner/'` rewrites asset URLs and serves public/* under
// that prefix, so we resolve fallback paths through import.meta.env.BASE_URL.
const BASE = import.meta.env.BASE_URL || '/';
const CATEGORY_KEYS = {
  electronics: 'electronics',
  fashion: 'fashion',
  home: 'home',
  beauty: 'beauty',
  grocery: 'home',
  toys: 'fashion',
  sports: 'home',
  books: 'beauty',
  default: 'placeholder',
};

function pickCategory(category) {
  if (!category) return CATEGORY_KEYS.default;
  const key = String(category).toLowerCase();
  return CATEGORY_KEYS[key] || CATEGORY_KEYS.default;
}

function parseImages(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function productImage(product) {
  if (!product) return `${BASE}seed-images/placeholder.svg`;
  const imgs = parseImages(product.imageUrls);
  if (imgs.length && imgs[0]) return imgs[0];
  const slug = pickCategory(product.category);
  return `${BASE}seed-images/${slug}.svg`;
}

export function productImages(product) {
  if (!product) return [`${BASE}seed-images/placeholder.svg`];
  const imgs = parseImages(product.imageUrls);
  if (imgs.length) return imgs;
  const slug = pickCategory(product.category);
  return [`${BASE}seed-images/${slug}.svg`];
}