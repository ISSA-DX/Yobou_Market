const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { productUpsert } = require('../lib/validators');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { audit, notifyProductChange } = require('../lib/notifications');

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

function stringifyImageUrls(data) {
  if (data.imageUrls === undefined) return data;
  return { ...data, imageUrls: JSON.stringify(data.imageUrls || []) };
}

// Re-shape Product.variants into a clean client-facing array. Caller may
// pass either the raw Prisma row or a transformed one (without variants).
function parseVariants(product) {
  if (!product || !Array.isArray(product.variants)) return product;
  return { ...product, variants: product.variants.map((v) => ({
    id: v.id,
    color: v.color,
    size: v.size,
    stock: v.stock,
  })) };
}

/**
 * Reconcile a product's variant rows in `db.productVariant` with the
 * caller-provided array. The reconciliation rules:
 *
 * - Rows in `variants` whose `id` matches an existing row are updated.
 * - Rows in `variants` without an `id` are created.
 * - Existing rows not present (by id) in `variants` are deleted.
 *
 * Run inside a `prisma.$transaction` that already holds a lock on the
 * product row so the resulting Product.stock stays in sync with the new
 * variant set.
 *
 * Returns the final sum-of-variant-stock. Caller is responsible for
 * updating Product.stock to this value on the same transaction.
 */
async function applyVariants(tx, productId, variants) {
  if (!Array.isArray(variants)) return 0;
  const ids = variants.map((v) => v.id).filter(Boolean);
  // Delete-then-create-then-update is sufficient because we're inside a
  // transaction holding the product row. Order matters: delete first so
  // the @@unique(productId, color, size) constraint doesn't fire while
  // we add a "new" row that duplicates one we're about to drop.
  if (ids.length === 0) {
    await tx.productVariant.deleteMany({ where: { productId } });
    for (const v of variants) {
      await tx.productVariant.create({
        data: {
          productId,
          color: v.color,
          size: v.size,
          stock: typeof v.stock === 'number' ? v.stock : 0,
        },
      });
    }
  } else {
    await tx.productVariant.deleteMany({
      where: { productId, NOT: { id: { in: ids } } },
    });
    for (const v of variants) {
      if (v.id) {
        await tx.productVariant.update({
          where: { id: v.id },
          data: {
            color: v.color,
            size: v.size,
            stock: typeof v.stock === 'number' ? v.stock : 0,
          },
        });
      } else {
        await tx.productVariant.create({
          data: {
            productId,
            color: v.color,
            size: v.size,
            stock: typeof v.stock === 'number' ? v.stock : 0,
          },
        });
      }
    }
  }
  const sum = variants.reduce((s, v) => s + (typeof v.stock === 'number' ? v.stock : 0), 0);
  return sum;
}

function requireAdminOrApprovedVendor(req, res, next) {
  if (req.user?.role === 'ADMIN') return next();
  return requireApprovedVendor(req, res, next);
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

// Public list — anyone (including guests) can browse products.
router.get('/', async (req, res, next) => {
  try {
    const { category, q, limit } = req.query;
    const where = { status: 'LIVE' };
    if (category) where.category = String(category);
    if (q) {
      const term = String(q);
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
        vendor: { select: { id: true, businessName: true } },
        variants: { select: { id: true, color: true, size: true, stock: true } },
      },
    });
    res.json({ products: products.map((p) => parseVariants(parseImageUrls(p))) });
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
        variants: { select: { id: true, color: true, size: true, stock: true } },
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

router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: { select: { id: true, businessName: true } },
        variants: { select: { id: true, color: true, size: true, stock: true } },
      },
    });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    // Hide non-live products from the public storefront unless owner/admin.
    const isOwner = req.user?.role === 'VENDOR' && product.vendorId === req.user.vendor?.id;
    const isAdmin = req.user?.role === 'ADMIN';
    if (product.status !== 'LIVE' && !isOwner && !isAdmin) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    res.json({ product: parseVariants(parseImageUrls(product)) });
  } catch (err) { next(err); }
});

// Vendor submits a CREATE change for admin approval (does not write a Product yet).
router.post('/', requireAuth, requireApprovedVendor, async (req, res, next) => {
  try {
    const data = productUpsert.parse(req.body);
    const { variants, ...rest } = data;
    const change = await prisma.productChange.create({
      data: {
        vendorId: req.user.vendor.id,
        action: 'CREATE',
        proposedName: rest.name,
        proposedDescription: rest.description || '',
        proposedPriceCents: rest.priceCents,
        proposedCategory: rest.category,
        proposedImageUrls: stringifyImageUrls(rest).imageUrls,
        proposedStock: rest.stock ?? 0,
        proposedStatus: rest.status || 'LIVE',
        proposedVariants: Array.isArray(variants) && variants.length > 0
          ? JSON.stringify(variants.map((v) => ({ color: v.color, size: v.size, stock: v.stock || 0 })))
          : null,
        variantsAction: Array.isArray(variants) && variants.length > 0 ? 'replace' : null,
        status: 'PENDING',
      },
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
    const product = await prisma.$transaction(async (tx) => {
      const { variants, ...rest } = data;
      // If variants are provided, Product.stock is the sum — server is
      // the source of truth, not the client.
      const stock = Array.isArray(variants) && variants.length > 0
        ? variants.reduce((s, v) => s + (typeof v.stock === 'number' ? v.stock : 0), 0)
        : data.stock;
      const created = await tx.product.create({
        data: { ...stringifyImageUrls(rest), stock },
      });
      if (Array.isArray(variants) && variants.length > 0) {
        await applyVariants(tx, created.id, variants.map((v) => ({ ...v, id: undefined })));
      }
      return tx.product.findUnique({
        where: { id: created.id },
        include: {
          variants: { select: { id: true, color: true, size: true, stock: true } },
        },
      });
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
    res.status(201).json({ product: parseVariants(parseImageUrls(product)) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Vendor submits an UPDATE change for admin approval; admin updates
// apply directly via the `if (isAdmin)` branch below.
router.patch('/:id', requireAuth, requireAdminOrApprovedVendor, async (req, res, next) => {
  try {
    const data = productUpsert.partial().parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    const isOwner = req.user.role === 'VENDOR' && product.vendorId === req.user.vendor?.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'FORBIDDEN' });

    // Admin updates apply immediately; vendor updates go through approval.
    if (isAdmin) {
      const updated = await prisma.$transaction(async (tx) => {
        const { variants, ...rest } = data;
        const updateData = stringifyImageUrls(rest);
        // If variants are provided, recompute Product.stock. If variants
        // is an empty array, that's "clear all variants" — stock falls
        // back to the legacy `data.stock` (or stays where it is if the
        // client didn't change it; we never wipe the field here).
        if (Array.isArray(variants)) {
          if (variants.length > 0) {
            updateData.stock = variants.reduce((s, v) => s + (typeof v.stock === 'number' ? v.stock : 0), 0);
          } else {
            updateData.stock = data.stock ?? 0;
          }
        }
        await tx.product.update({ where: { id: req.params.id }, data: updateData });
        if (Array.isArray(variants)) {
          await applyVariants(tx, req.params.id, variants);
        }
        return tx.product.findUnique({
          where: { id: req.params.id },
          include: {
            variants: { select: { id: true, color: true, size: true, stock: true } },
          },
        });
      });
      await audit(req.user.id, {
        action: 'product.update',
        entityType: 'Product',
        entityId: updated.id,
        meta: { name: updated.name, category: updated.category, vendorId: updated.vendorId, variantCount: updated.variants.length },
      });
      await notifyProductChange({ action: 'update', product: updated });
      return res.json({ product: parseVariants(parseImageUrls(updated)) });
    }

    const change = await prisma.productChange.create({
      data: {
        vendorId: req.user.vendor.id,
        productId: product.id,
        action: 'UPDATE',
        proposedName: data.name ?? null,
        proposedDescription: data.description ?? null,
        proposedPriceCents: data.priceCents ?? null,
        proposedCategory: data.category ?? null,
        proposedImageUrls: data.imageUrls !== undefined ? JSON.stringify(data.imageUrls || []) : null,
        proposedStock: data.stock ?? null,
        proposedStatus: data.status ?? null,
        proposedVariants: data.variants !== undefined ? JSON.stringify(data.variants || []) : null,
        variantsAction: data.variants !== undefined ? 'replace' : null,
        status: 'PENDING',
      },
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
    res.status(202).json({ change });
  } catch (err) { next(err); }
});

router.parseImageUrls = parseImageUrls;
router.stringifyImageUrls = stringifyImageUrls;
router.parseVariants = parseVariants;
router.applyVariants = applyVariants;

module.exports = router;