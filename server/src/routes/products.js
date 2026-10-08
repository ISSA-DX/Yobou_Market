const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { productUpsert, productUpsertPartial, productListQuery } = require('../lib/validators');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { audit, notifyProductChange, notifyAdminsProductChangeSubmitted } = require('../lib/notifications');

const router = express.Router();

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 5);

function parseImageUrls(product) {
  if (!product || typeof product.imageUrls !== 'string') return product;
  try {
    return { ...product, imageUrls: JSON.parse(product.imageUrls) };
  } catch {
    return { ...product, imageUrls: [] };
  }
}

function parseVariants(product) {
  if (!product) return product;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return {
    ...product,
    variants: variants.map((variant) => ({
      ...variant,
      imageUrls: Array.isArray(variant.imageUrls)
        ? variant.imageUrls
        : (() => {
            if (typeof variant.imageUrls !== 'string') return [];
            try { return JSON.parse(variant.imageUrls) || []; } catch { return []; }
          })(),
    })),
  };
}

function parseExtraCategories(product) {
  if (!product) return product;
  return product;
}

function stringifyImageUrls(data) {
  if (data.imageUrls === undefined) return data;
  return { ...data, imageUrls: JSON.stringify(data.imageUrls || []) };
}

function variantStockTotal(variants) {
  if (!Array.isArray(variants)) return 0;
  return variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
}

async function applyVariants(tx, productId, variants) {
  const rows = Array.isArray(variants) ? variants : [];
  await tx.productVariant.deleteMany({ where: { productId } });
  if (rows.length === 0) return [];

  return Promise.all(rows.map((variant) => tx.productVariant.create({
    data: {
      productId,
      color: String(variant.color || '').trim(),
      size: String(variant.size || '').trim(),
      stock: Number(variant.stock) || 0,
      imageUrls: JSON.stringify(Array.isArray(variant.imageUrls) ? variant.imageUrls : []),
    },
  })));
}

function requireAdminOrApprovedVendor(req, res, next) {
  if (req.user?.role === 'ADMIN') return next();
  return requireApprovedVendor(req, res, next);
}

// Normalize the extraCategories array. Mirrors the invariants the
// admin form applies client-side (trim, drop empties, dedupe) plus a
// 10-entry cap and an 80-char per-name cap to match `Product.category`.
// Idempotent — safe to call on every write.
function normalizeExtraCategories(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > 80) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 10) break;
  }
  return out;
}

// Reconcile the CategoryExtra rows for a product with the caller's
// array. The reconciliation matches the variant helper: delete all
// existing rows for the product, then create the new ones. ≤10
// inserts makes this trivially cheap. Run inside a transaction that
// already holds the product row.
async function applyExtraCategories(tx, productId, names) {
  await tx.categoryExtra.deleteMany({ where: { productId } });
  for (const name of names) {
    await tx.categoryExtra.create({ data: { productId, name } });
  }
}

// Build an absolute URL from the live request so <img src=...> resolves
// correctly when the SPA is served from a different origin than the API
// (e.g. the GitHub-Pages deployment where the API is on Render and the
// SPA is on isaa-dx.github.io). `app.set('trust proxy', 1)` in
// server/src/index.js makes x-forwarded-proto/host trustworthy.
function absoluteUploadUrl(req, filename) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0];
  if (!host) return `/uploads/${filename}`; // single-host fallback
  return `${proto}://${host}/uploads/${filename}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});

// Image upload for product media (admin + approved vendors).
router.post('/upload', requireAuth, requireAdminOrApprovedVendor, upload.single('image'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE' });
    // Absolute URL — see absoluteUploadUrl. Required so the deployed
    // GitHub-Pages admin can render the thumbnail without same-origin
    // collision with the API.
    res.json({ url: absoluteUploadUrl(req, req.file.filename) });
  } catch (err) { next(err); }
});

// Map the `sort` query value to a Prisma orderBy spec. Single-key
// orders for now — features sort uses createdAt desc (same as
// newest) so the Phase-0 UX costs nothing; promoting featured to
// an ML score is a future-session problem.
function sortToOrderBy(sort) {
  switch (sort) {
    case 'price-asc':  return [{ priceCents: 'asc' }, { createdAt: 'desc' }];
    case 'price-desc': return [{ priceCents: 'desc' }, { createdAt: 'desc' }];
    case 'name-asc':   return [{ name: 'asc' }];
    case 'newest':     return [{ createdAt: 'desc' }];
    case 'featured':
    default:           return [{ createdAt: 'desc' }];
  }
}

// Public list — anyone (including guests) can browse products.
// Phase-0 storefront: accepts the full productListQuery schema
// (q / category / vendor / minPrice / maxPrice / inStock / sort /
// page / pageSize) and returns { products, facets, pagination }.
// Facets are computed *unfiltered* against status='LIVE' so the
// shopper sees the full range of available categories/vendors even
// when a category is currently selected — this is the Shopify +
// Amazon pattern and prevents the empty-facet death-spiral where
// picking a leaf filter removes all alternative chips.
router.get('/', async (req, res, next) => {
  try {
    const parsed = productListQuery.parse(req.query);
    const where = { status: 'LIVE' };
    if (parsed.category) where.category = parsed.category;
    if (parsed.vendor) where.vendorId = parsed.vendor;
    if (parsed.q) {
      const term = parsed.q;
      where.OR = [
        { name: { contains: term } },
        { category: { contains: term } },
        { description: { contains: term } },
      ];
    }
    const take = limit ? Math.max(1, Math.min(100, Number(limit) || 100)) : 100;
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        vendor: { select: { id: true, businessName: true, status: true } },
        variants: { orderBy: { createdAt: 'asc' } },
      },
    });
    res.json({ products: products.map((p) => parseExtraCategories(parseVariants(parseImageUrls(p)))) });
  } catch (err) { next(err); }
});

// Backwards-compatible legacy list — derived from the curated Category
// table. Shopper pages still call `/api/products/categories` for the
// name+count shape; new admin/partner pickers should hit
// `/api/categories` which adds id/slug/isActive.
router.get('/categories', async (_req, res, next) => {
  try {
    const rows = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const groups = await prisma.product.groupBy({
      by: ['category'],
      where: { status: 'LIVE' },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(groups.map((g) => [g.category, g._count._all]));
    res.json({ categories: rows.map((c) => ({ name: c.name, count: counts[c.name] || 0 })) });
  } catch (err) { next(err); }
});

function discountPercent(product) {
  if (!product?.compareAtPriceCents || product.compareAtPriceCents <= product.priceCents) return 0;
  return Math.round(((product.compareAtPriceCents - product.priceCents) / product.compareAtPriceCents) * 100);
}

// Public curated home feed — returns the data slices the customer homepage
// needs in a single round-trip, so the app can render skeletons once and
// fill content without multiple cascading requests.
// Each product also gets a `soldCount` so the UI can show real social proof
// ("X sold") without adding a new schema column.
router.get('/feed', async (_req, res, next) => {
  try {
    const all = await prisma.product.findMany({
      where: { status: 'LIVE' },
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { id: true, businessName: true, status: true } } },
    });

    // Real sales counts across non-cancelled/refunded orders.
    const soldAgg = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } },
      },
      _sum: { quantity: true },
    });
    const soldByProduct = Object.fromEntries(
      soldAgg.map((r) => [r.productId, r._sum.quantity || 0])
    );

    const parsed = all.map((p) => ({
      ...parseImageUrls(p),
      soldCount: soldByProduct[p.id] || 0,
    }));

    const deals = parsed
      .filter((p) => p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents)
      .sort((a, b) => discountPercent(b) - discountPercent(a))
      .slice(0, 10)
      .map((p) => ({ ...p, discountPercent: discountPercent(p) }));

    const newArrivals = parsed.slice(0, 10);

    const featuredCategories = ['Electronics', 'Fashion', 'Home', 'Beauty', 'Gaming', 'Phones', 'Sports'];
    const featured = parsed
      .filter((p) => featuredCategories.includes(p.category))
      .slice(0, 10);

    const trending = parsed
      .filter((p) => p.soldCount > 0)
      .sort((a, b) => b.soldCount - a.soldCount)
      .slice(0, 10);

    const usedIds = new Set([...deals, ...newArrivals, ...featured, ...trending].map((p) => p.id));
    const rest = parsed.filter((p) => !usedIds.has(p.id));

    res.json({ deals, newArrivals, featured, trending, all: rest.slice(0, 100) });
  } catch (err) { next(err); }
});

// Vendor-only: list own products (for /vendor/products page).
// Must be defined BEFORE /:id so it isn't captured as an ID.
// Supports ?status=LIVE|DRAFT|HIDDEN and ?q=foo (search name/category/description).
router.get('/vendor/mine', requireAuth, requireApprovedVendor, async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const where = { vendorId: req.user.vendor.id };
    if (status && ['LIVE', 'DRAFT', 'HIDDEN'].includes(String(status))) {
      where.status = String(status);
    }
    if (q) {
      const term = String(q);
      where.OR = [
        { name: { contains: term } },
        { category: { contains: term } },
        { description: { contains: term } },
      ];
    }
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        variants: { select: { id: true, color: true, size: true, stock: true, imageUrls: true } },
      },
    });
    res.json({ products: products.map((p) => parseVariants(parseImageUrls(p))) });
  } catch (err) { next(err); }
});

// Vendor-only: quick stock-only edit. Queues a ProductChange with action
// UPDATE and only `proposedStock` set, so admin approval flips stock
// atomically and audit history stays intact. Must be BEFORE /:id.
const vendorStockEdit = z.object({ stock: z.number().int().nonnegative() });
router.patch('/vendor/:id/stock', requireAuth, requireApprovedVendor, async (req, res, next) => {
  try {
    const { stock } = vendorStockEdit.parse(req.body);
    const vendorId = req.user.vendor.id;
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    if (product.vendorId !== vendorId) return res.status(403).json({ error: 'FORBIDDEN' });

    const change = await prisma.productChange.create({
      data: {
        vendorId,
        productId: product.id,
        action: 'UPDATE',
        proposedStock: stock,
        status: 'PENDING',
      },
    });
    await notifyAdminsProductChangeSubmitted({
      changeId: change.id,
      vendorId,
      action: 'UPDATE',
      productId: product.id,
      productName: product.name,
    });
    res.status(202).json({
      change: parseChange(change),
      product: parseImageUrls(product),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

const parseChange = (change) => {
  if (!change) return change;
  const out = { ...change };
  if (typeof change.proposedImageUrls === 'string') {
    try { out.proposedImageUrls = JSON.parse(change.proposedImageUrls); }
    catch { out.proposedImageUrls = []; }
  }
  if (typeof change.proposedVariants === 'string' && change.proposedVariants) {
    try { out.proposedVariants = JSON.parse(change.proposedVariants); }
    catch { out.proposedVariants = []; }
  }
  return out;
};

// "Customers also viewed" — products in the same category, excluding
// the current product. Public, no auth. In-stock items sort before
// out-of-stock; ties broken by recency. We do not fall back across
// categories — when the rail is empty we return [] and the shopper
// UI hides the section silently. This route is declared BEFORE
// `/:id` so the literal "related" path doesn't get captured as an ID.
router.get('/:id/related', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 10));
    const target = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, category: true, status: true },
    });
    if (!target) return res.status(404).json({ error: 'NOT_FOUND' });
    const rows = await prisma.product.findMany({
      where: { status: 'LIVE', category: target.category, NOT: { id: target.id } },
      orderBy: [{ stock: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        vendor: { select: { id: true, businessName: true } },
        variants: { select: { id: true, color: true, size: true, stock: true, imageUrls: true } },
      },
    });
    res.json({ products: rows.map((p) => parseVariants(parseImageUrls(p))) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: { select: { id: true, businessName: true, status: true } },
        variants: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    // Hide non-live products from the public storefront unless owner/admin.
    const isOwner = req.user?.role === 'VENDOR' && product.vendorId === req.user.vendor?.id;
    const isAdmin = req.user?.role === 'ADMIN';
    if (product.status !== 'LIVE' && !isOwner && !isAdmin) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    res.json({ product: parseExtraCategories(parseVariants(parseImageUrls(product))) });
  } catch (err) { next(err); }
});

// Vendor submits a CREATE change for admin approval (does not write a Product yet).
router.post('/', requireAuth, requireApprovedVendor, async (req, res, next) => {
  try {
    const data = productUpsert.parse(req.body);
    const { variants, extraCategories, ...rest } = data;
    // Normalize extras once at submit time so the admin can read the
    // proposal exactly as it will land after approval. Stored as a
    // JSON string on the change row.
    const normalizedExtras = normalizeExtraCategories(extraCategories);
    const change = await prisma.productChange.create({
      data: {
        vendorId: req.user.vendor.id,
        action: 'CREATE',
        proposedName: rest.name,
        proposedDescription: rest.description || '',
        proposedPriceCents: rest.priceCents,
        // Empty string on the form = "no deal" → null on the change. The
        // admin-approval apply step will set Product.compareAtPriceCents
        // to null in that case, which keeps the storefront from rendering
        // a strikethrough/percentage badge.
        proposedCompareAtPriceCents: rest.compareAtPriceCents ?? null,
        proposedCategory: rest.category,
        proposedImageUrls: stringifyImageUrls(rest).imageUrls,
        proposedStock: rest.stock ?? 0,
        proposedStatus: rest.status || 'LIVE',
        proposedVariants: Array.isArray(variants) && variants.length > 0
          ? JSON.stringify(variants.map((v) => ({ color: v.color, size: v.size, stock: v.stock || 0 })))
          : null,
        variantsAction: Array.isArray(variants) && variants.length > 0 ? 'replace' : null,
        // Placement flags for CREATE. We pass through the values
        // directly (not the schema defaults) so the admin can see
        // what the vendor submitted. Approval falls through to the
        // schema defaults on a null value so vendors who don't care
        // about placements don't have to fill this in.
        proposedShowOnHome:       rest.showOnHome       ?? null,
        proposedShowOnDeals:      rest.showOnDeals      ?? null,
        proposedShowOnFlashDeals: rest.showOnFlashDeals ?? null,
        proposedShowOnSearch:     rest.showOnSearch     ?? null,
        proposedExtraCategories:  JSON.stringify(normalizedExtras),
        status: 'PENDING',
      },
    });
    await notifyAdminsProductChangeSubmitted({
      changeId: change.id,
      vendorId: req.user.vendor.id,
      action: 'CREATE',
      productId: null,
      productName: rest.name,
    });
    res.status(201).json({ change: parseChange(change) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Admin can create products without a vendor (vendorId = null = "Yobou Direct") — applies immediately.
router.post('/admin', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = productUpsert.parse(req.body);
    const variants = Array.isArray(data.variants) ? data.variants : [];
    const effectiveStock = variants.length > 0 ? variantStockTotal(variants) : data.stock ?? 0;

    const product = await prisma.$transaction(async (tx) => {
      const { variants: _ignoredVariants, ...productData } = stringifyImageUrls(data);
      const created = await tx.product.create({
        data: {
          ...productData,
          stock: effectiveStock,
          ...(variants.length > 0 ? {
            variants: {
              create: variants.map((variant) => ({
                color: String(variant.color || '').trim(),
                size: String(variant.size || '').trim(),
                stock: Number(variant.stock) || 0,
                imageUrls: JSON.stringify(Array.isArray(variant.imageUrls) ? variant.imageUrls : []),
              })),
            },
          } : {}),
        },
        include: { variants: { orderBy: { createdAt: 'asc' } } },
      });
      return created;
    });

    // Audit + live fan-out. notifyProductChange handles "vendor-less"
    // products by skipping the vendor owner branch internally.
    await audit(req.user.id, {
      action: 'product.create',
      entityType: 'Product',
      entityId: product.id,
      meta: { name: product.name, category: product.category, vendorId: product.vendorId, variantCount: product.variants.length },
    });
    await notifyProductChange({ action: 'create', product });
    res.status(201).json({ product: parseExtraCategories(parseVariants(parseImageUrls(product))) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Vendor submits an UPDATE change for admin approval; admin updates
// apply directly via the `if (isAdmin)` branch below.
router.patch('/:id', requireAuth, requireAdminOrApprovedVendor, async (req, res, next) => {
  try {
    const data = productUpsertPartial.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    const isOwner = req.user.role === 'VENDOR' && product.vendorId === req.user.vendor?.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'FORBIDDEN' });

    // Cross-field deal-price check. The partial validator only enforces
    // compareAt > priceCents when BOTH are present in the body, so when
    // the vendor sets just `compareAtPriceCents` we re-check against the
    // live product here. Same rule as productChanges.js POST + approve.
    if (data.compareAtPriceCents != null) {
      const targetPrice = (data.priceCents != null) ? data.priceCents : product.priceCents;
      if (data.compareAtPriceCents <= targetPrice) {
        return res.status(400).json({
          error: 'INVALID_INPUT',
          issues: [{ path: ['compareAtPriceCents'], message: 'compareAtPriceCents must be greater than priceCents' }],
        });
      }
    }

    // Admin updates apply immediately; vendor updates go through approval.
    if (isAdmin) {
      const updated = await prisma.$transaction(async (tx) => {
        const normalizedVariants = Array.isArray(data.variants) ? data.variants : undefined;
        const nextStock = normalizedVariants !== undefined
          ? (normalizedVariants.length > 0 ? variantStockTotal(normalizedVariants) : (data.stock ?? 0))
          : undefined;

        const { variants: _ignoredVariants, ...productData } = stringifyImageUrls(data);
        const payload = { ...productData };
        if (nextStock !== undefined) payload.stock = nextStock;

        const updatedProduct = await tx.product.update({
          where: { id: req.params.id },
          data: payload,
          include: { variants: { orderBy: { createdAt: 'asc' } } },
        });

        if (normalizedVariants !== undefined) {
          await applyVariants(tx, req.params.id, normalizedVariants);
          const refreshed = await tx.product.findUnique({
            where: { id: req.params.id },
            include: { variants: { orderBy: { createdAt: 'asc' } } },
          });
          return refreshed;
        }

        return updatedProduct;
      });
      await audit(req.user.id, {
        action: 'product.update',
        entityType: 'Product',
        entityId: updated.id,
        meta: { name: updated.name, category: updated.category, vendorId: updated.vendorId, variantCount: updated.variants.length },
      });
      await notifyProductChange({ action: 'update', product: updated });
      return res.json({ product: parseExtraCategories(parseVariants(parseImageUrls(updated))) });
    }

    const change = await prisma.productChange.create({
      data: {
        vendorId: req.user.vendor.id,
        productId: product.id,
        action: 'UPDATE',
        proposedName: data.name ?? null,
        proposedDescription: data.description ?? null,
        proposedPriceCents: data.priceCents ?? null,
        // Presence in the body is the signal: undefined = "don't touch
        // the deal" (preserves the existing value on the product); a
        // number = "apply this"; null = "remove the deal" (admin
        // approval path will set Product.compareAtPriceCents to null).
        // Route handler in productChanges.js re-validates compareAt >
        // priceCents against the live product before applying.
        proposedCompareAtPriceCents: data.compareAtPriceCents !== undefined ? data.compareAtPriceCents : null,
        proposedCategory: data.category ?? null,
        proposedImageUrls: data.imageUrls !== undefined ? JSON.stringify(data.imageUrls || []) : null,
        proposedStock: data.stock ?? null,
        proposedStatus: data.status ?? null,
        proposedVariants: data.variants !== undefined ? JSON.stringify(data.variants || []) : null,
        variantsAction: data.variants !== undefined ? 'replace' : null,
        // Placement flags. null = "leave alone" (the standard
        // proposed* convention on UPDATE). On admin approval the
        // change-apply path only writes the Product column when the
        // proposed value is non-null, so an empty placement section
        // on the form is a true no-op.
        proposedShowOnHome:       data.showOnHome       ?? null,
        proposedShowOnDeals:      data.showOnDeals      ?? null,
        proposedShowOnFlashDeals: data.showOnFlashDeals ?? null,
        proposedShowOnSearch:     data.showOnSearch     ?? null,
        // Extra categories: normalize then JSON-encode. The change
        // record only carries a JSON snapshot; the approval path
        // reconciles the join table.
        proposedExtraCategories: data.extraCategories !== undefined
          ? JSON.stringify(normalizeExtraCategories(data.extraCategories))
          : null,
        status: 'PENDING',
      },
    });
    await notifyAdminsProductChangeSubmitted({
      changeId: change.id,
      vendorId: req.user.vendor.id,
      action: 'UPDATE',
      productId: product.id,
      productName: data.name || product.name,
    });
    res.status(202).json({ change: parseChange(change) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.delete('/:id', requireAuth, requireAdminOrApprovedVendor, async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    const isOwner = req.user.role === 'VENDOR' && product.vendorId === req.user.vendor?.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'FORBIDDEN' });

    // Admin can hard-delete (with the existing order-history guard).
    if (isAdmin) {
      const ordered = await prisma.orderItem.findFirst({ where: { productId: req.params.id } });
      if (ordered) return res.status(409).json({ error: 'PRODUCT_HAS_ORDERS' });
      // Snapshot before delete so notifyProductChange has a name/category
      // to put in the audit + SSE payload.
      const product = await prisma.product.findUnique({ where: { id: req.params.id } });
      await prisma.product.delete({ where: { id: req.params.id } });
      await audit(req.user.id, {
        action: 'product.delete',
        entityType: 'Product',
        entityId: req.params.id,
        meta: { name: product?.name, category: product?.category, vendorId: product?.vendorId },
      });
      await notifyProductChange({ action: 'delete', product: { ...product, id: req.params.id } });
      return res.json({ ok: true });
    }

    // Vendor submits a DELETE change for admin approval (hides on approval unless no orders).
    const change = await prisma.productChange.create({
      data: {
        vendorId: req.user.vendor.id,
        productId: product.id,
        action: 'DELETE',
        status: 'PENDING',
      },
    });
    await notifyAdminsProductChangeSubmitted({
      changeId: change.id,
      vendorId: req.user.vendor.id,
      action: 'DELETE',
      productId: product.id,
      productName: product.name,
    });
    res.status(202).json({ change });
  } catch (err) { next(err); }
});

router.parseImageUrls = parseImageUrls;
router.stringifyImageUrls = stringifyImageUrls;
router.parseVariants = parseVariants;
router.applyVariants = applyVariants;

module.exports = router;