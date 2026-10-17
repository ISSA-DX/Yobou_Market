// Category merchandising — campaign banners, curated collections and the
// stores selling in a category. Shared by the public category payload,
// the store / collection pages and the admin + partner tools, so "what is
// live" is decided in exactly one place.
const { prisma } = require('../prisma');
const { inCategoryWhere } = require('./placement');

// ---------------------------------------------------------------------------
// Campaign banners

/** Prisma where: campaigns a shopper can see right now. */
function liveCampaignWhere(now = new Date()) {
  return {
    status: 'APPROVED',
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

function campaignState(c, now = new Date()) {
  if (c.status !== 'APPROVED') return c.status; // PENDING | REJECTED
  if (!c.isActive) return 'PAUSED';
  if (c.startsAt && c.startsAt > now) return 'SCHEDULED';
  if (c.endsAt && c.endsAt < now) return 'ENDED';
  return 'LIVE';
}

function serializeCampaign(c) {
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    ctaLabel: c.ctaLabel,
    linkUrl: c.linkUrl,
    imageUrl: c.imageUrl,
    category: c.category,
    subcategory: c.subcategory,
    status: c.status,
    state: campaignState(c),
    isActive: c.isActive,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    sortOrder: c.sortOrder,
    reviewNote: c.reviewNote,
    vendor: c.vendor ? { id: c.vendor.id, businessName: c.vendor.businessName, logoUrl: c.vendor.logoUrl } : null,
    createdAt: c.createdAt,
  };
}

// Banners may only link inside the app (no phishing / off-site links).
function isInternalLink(url) {
  return typeof url === 'string' && /^\/[A-Za-z0-9/_\-?=&%.]*$/.test(url) && !url.startsWith('//');
}

// ---------------------------------------------------------------------------
// Product wire shape (same as GET /api/products)

const PRODUCT_INCLUDE = {
  vendor: { select: { id: true, businessName: true } },
  variants: { select: { id: true, color: true, size: true, stock: true, imageUrls: true } },
  extraCategories: { select: { id: true, name: true, subcategory: true } },
};

function formatProduct(p) {
  // Lazy: routes/products requires this module indirectly.
  const productsRouter = require('../routes/products');
  const withImages = productsRouter.parseImageUrls(p);
  const withVariants = productsRouter.parseVariants(withImages);
  return {
    ...withVariants,
    extraCategories: (p.extraCategories || []).map((e) => ({ id: e.id, name: e.name, subcategory: e.subcategory || null })),
  };
}

// ---------------------------------------------------------------------------
// Collections

function parseJson(s, fallback) {
  try {
    const v = JSON.parse(s || '');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

const discountPct = (p) => (p.compareAtPriceCents > p.priceCents
  ? Math.round(((p.compareAtPriceCents - p.priceCents) / p.compareAtPriceCents) * 100)
  : 0);

/**
 * Products in a collection, in display order. MANUAL keeps the admin's
 * order (skipping anything no longer live); RULE filters the category's
 * live products. `limit` caps the result (rails use 12).
 */
async function resolveCollection(c, { limit = 60 } = {}) {
  if (c.mode === 'MANUAL') {
    const ids = parseJson(c.productIds, []).filter((x) => typeof x === 'string');
    if (ids.length === 0) return [];
    const rows = await prisma.product.findMany({ where: { id: { in: ids }, status: 'LIVE' }, include: PRODUCT_INCLUDE });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit).map(formatProduct);
  }
  const rule = parseJson(c.rule, {});
  const where = { status: 'LIVE', ...inCategoryWhere(c.category, c.subcategory || undefined) };
  if (rule.maxPriceCents) where.priceCents = { lte: Number(rule.maxPriceCents) };
  if (rule.inStockOnly) where.stock = { gt: 0 };
  const orderBy = rule.sort === 'price-asc' ? [{ priceCents: 'asc' }] : [{ createdAt: 'desc' }];
  let rows = await prisma.product.findMany({ where, orderBy, include: PRODUCT_INCLUDE, take: 200 });
  if (rule.minDiscountPct) rows = rows.filter((p) => discountPct(p) >= Number(rule.minDiscountPct));
  if (rule.sort === 'discount') rows.sort((a, b) => discountPct(b) - discountPct(a));
  return rows.slice(0, limit).map(formatProduct);
}

function serializeCollection(c, products) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    category: c.category,
    subcategory: c.subcategory,
    mode: c.mode,
    productIds: parseJson(c.productIds, []),
    rule: parseJson(c.rule, {}),
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    ...(products ? { products, productCount: products.length } : {}),
  };
}

// ---------------------------------------------------------------------------
// Stores

/** Approved partners selling LIVE products in a category, busiest first. */
async function storesInCategory(category, { limit = 12 } = {}) {
  const rows = await prisma.product.findMany({
    where: { status: 'LIVE', vendorId: { not: null }, ...inCategoryWhere(category) },
    select: { vendorId: true, priceCents: true, compareAtPriceCents: true },
  });
  const agg = new Map();
  for (const r of rows) {
    const a = agg.get(r.vendorId) || { productCount: 0, dealCount: 0 };
    a.productCount += 1;
    if (r.compareAtPriceCents > r.priceCents) a.dealCount += 1;
    agg.set(r.vendorId, a);
  }
  if (agg.size === 0) return [];
  const vendors = await prisma.vendor.findMany({
    where: { id: { in: [...agg.keys()] }, status: 'APPROVED' },
    select: { id: true, businessName: true, logoUrl: true, bannerUrl: true, description: true },
  });
  return vendors
    .map((v) => ({ ...v, ...agg.get(v.id) }))
    .sort((a, b) => b.productCount - a.productCount || a.businessName.localeCompare(b.businessName))
    .slice(0, limit);
}

module.exports = {
  liveCampaignWhere,
  campaignState,
  serializeCampaign,
  isInternalLink,
  resolveCollection,
  serializeCollection,
  storesInCategory,
  formatProduct,
  PRODUCT_INCLUDE,
  parseJson,
};
