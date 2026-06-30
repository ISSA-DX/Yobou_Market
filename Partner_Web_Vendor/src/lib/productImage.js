// Resolve the best image URL for a product. The product's imageUrls column
// is a JSON string stored by the server (Prisma + SQLite has no native
// array, so we serialize). We fall back to the bundled SVG set in
// Partner_Web_Vendor/public/seed-images so the partner app always has
// something to render.
//
// Vite's `base: '/partner/'` rewrites asset URLs and serves public/* under
// that prefix, so we resolve fallback paths through import.meta.env.BASE_URL.
const BASE = import.meta.env.BASE_URL || '/';
const API = import.meta.env.VITE_API_BASE || '';

// Heal older DB rows that store relative paths (`/uploads/foo.png`).
// When the SPA is served from the API's own host (single-host prod,
// happy during local dev), `API` is empty and we leave them as-is.
// When the SPA is served from GitHub Pages (deployed pilot), we
// rewrite to the Render API URL. New uploads are already absolute
// (see server/src/routes/products.js absoluteUploadUrl), so this is
// purely a back-compat safety net for pre-fix rows.
function resolveUrl(u) {
  if (!u) return u;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith('/') && API) return `${API}${u}`;
  return u;
}

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
  const imgs = parseImages(product.imageUrls).map(resolveUrl);
  if (imgs.length && imgs[0]) return imgs[0];
  const slug = pickCategory(product.category);
  return `${BASE}seed-images/${slug}.svg`;
}

export function productImages(product) {
  if (!product) return [`${BASE}seed-images/placeholder.svg`];
  const imgs = parseImages(product.imageUrls).map(resolveUrl);
  if (imgs.length) return imgs;
  const slug = pickCategory(product.category);
  return [`${BASE}seed-images/${slug}.svg`];
}