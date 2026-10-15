// Product placement — the one definition of WHERE a product appears.
//
// Two kinds of placement:
//   1. Surface flags (Product.showOn*): Home feed, New arrivals, Recent
//      deals, Deals, Flash deals, Category spotlight, Search.
//   2. Category pins (CategoryExtra rows): extra category / department
//      pages a product appears on, in addition to its primary
//      category + subcategory.
//
// The admin product form, the partner product form (via the
// ProductChange approval queue), the admin bulk tool and the public
// product list all read these definitions, so adding a surface means
// adding one line here (plus a column).

const PLACEMENT_FLAGS = [
  { key: 'showOnHome', default: true, proposed: 'proposedShowOnHome' },
  { key: 'showOnNewArrivals', default: true, proposed: 'proposedShowOnNewArrivals' },
  { key: 'showOnRecentDeals', default: false, proposed: 'proposedShowOnRecentDeals' },
  { key: 'showOnDeals', default: true, proposed: 'proposedShowOnDeals' },
  { key: 'showOnFlashDeals', default: false, proposed: 'proposedShowOnFlashDeals' },
  { key: 'showOnCategorySpotlight', default: false, proposed: 'proposedShowOnCategorySpotlight' },
  { key: 'showOnSearch', default: true, proposed: 'proposedShowOnSearch' },
];
const FLAG_KEYS = PLACEMENT_FLAGS.map((f) => f.key);

const MAX_PINS = 10;

// Accepts the shapes clients have sent over time:
//   'Kitchen'                               (legacy: whole category)
//   { name: 'Kitchen', subcategory: 'Cookware' }
// → [{ name, subcategory|null }], trimmed, one pin per category
// (first wins), capped at MAX_PINS. Idempotent.
function normalizeExtraCategories(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    const name = typeof raw === 'string' ? raw : raw?.name;
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const sub = typeof raw === 'object' && typeof raw?.subcategory === 'string' ? raw.subcategory.trim().slice(0, 80) : '';
    out.push({ name: trimmed, subcategory: sub || null });
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

// Replace a product's pins with `pins` (already normalized). Run inside
// the transaction that writes the product.
async function applyExtraCategories(tx, productId, pins) {
  await tx.categoryExtra.deleteMany({ where: { productId } });
  for (const pin of pins) {
    await tx.categoryExtra.create({ data: { productId, name: pin.name, subcategory: pin.subcategory || null } });
  }
}

// Read a ProductChange's JSON snapshot of proposed pins.
function parseProposedPins(json) {
  try {
    return normalizeExtraCategories(JSON.parse(json || '[]'));
  } catch {
    return [];
  }
}

// Prisma `where` fragment: products whose PRIMARY placement is this
// category (and department), or that are pinned there.
function inCategoryWhere(category, subcategory) {
  const pin = subcategory ? { name: category, subcategory } : { name: category };
  return {
    OR: [
      subcategory ? { category, subcategory } : { category },
      { extraCategories: { some: pin } },
    ],
  };
}

// Pins on the product wire shape.
function pinsToWire(rows) {
  return (rows || []).map((e) => ({ id: e.id, name: e.name, subcategory: e.subcategory || null }));
}

module.exports = {
  PLACEMENT_FLAGS,
  FLAG_KEYS,
  MAX_PINS,
  normalizeExtraCategories,
  applyExtraCategories,
  parseProposedPins,
  inCategoryWhere,
  pinsToWire,
};
