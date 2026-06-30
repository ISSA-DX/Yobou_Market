// Resolve the best image URL for a product. The product's imageUrls column
// is a JSON string stored by the server (Prisma + SQLite has no native
// array, so we serialize). On the WebView we also fall back to the bundled
// SVG set in APP_shopper_and_buyer/public/seed-images so the app works
// offline; picsum.photos is unreachable from the Android emulator WebView.
const API = import.meta.env.VITE_API_BASE || '';

// Heal older DB rows that store relative paths (`/uploads/foo.png`).
// APK builds hit the API directly so API is empty there and we leave
// relative paths alone. GitHub-Pages pilot builds set VITE_API_BASE,
// so legacy rows rehydrate to the Render API URL. New uploads are
// already absolute (see server/src/routes/products.js absoluteUploadUrl).
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
  if (!product) return '/seed-images/placeholder.svg';
  const imgs = parseImages(product.imageUrls).map(resolveUrl);
  if (imgs.length && imgs[0]) return imgs[0];
  const slug = pickCategory(product.category);
  return `/seed-images/${slug}.svg`;
}

export function productImages(product) {
  if (!product) return ['/seed-images/placeholder.svg'];
  const imgs = parseImages(product.imageUrls).map(resolveUrl);
  if (imgs.length) return imgs;
  const slug = pickCategory(product.category);
  return [`/seed-images/${slug}.svg`];
}
