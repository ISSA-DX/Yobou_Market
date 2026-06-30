const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { productChangeCreate, adminReview } = require('../lib/validators');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { notify, audit, notifyProductChange } = require('../lib/notifications');
const { applyVariants } = require('./products');

const router = express.Router();

// Parses the JSON-stored proposedImageUrls + proposedVariants strings
// back to arrays on read. Both columns are nullable, so check each
// independently rather than bailing out when one is missing.
function parseChange(change) {
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
}

function stringifyImageUrls(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

function stringifyVariants(arr) {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

// Vendor submits a change request for admin approval.
// Action CREATE -> proposed* fields required and applied on approval.
// Action UPDATE -> productId required; only non-null proposed* fields are applied.
// Action DELETE -> productId required; no proposed* fields.
router.post('/', requireAuth, requireApprovedVendor, async (req, res, next) => {
  try {
    const data = productChangeCreate.parse(req.body);
    const vendorId = req.user.vendor.id;

    if (data.action === 'UPDATE' || data.action === 'DELETE') {
      const product = await prisma.product.findUnique({ where: { id: data.productId } });
      if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
      if (product.vendorId !== vendorId) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const change = await prisma.productChange.create({
      data: {
        vendorId,
        productId: data.productId || null,
        action: data.action,
        proposedName: data.name ?? null,
        proposedDescription: data.description ?? null,
        proposedPriceCents: data.priceCents ?? null,
        proposedCategory: data.category ?? null,
        proposedImageUrls: data.imageUrls !== undefined ? stringifyImageUrls(data.imageUrls) : null,
        proposedStock: data.stock ?? null,
        proposedStatus: data.status ?? null,
        proposedVariants: data.variants !== undefined ? stringifyVariants(data.variants) : null,
        variantsAction: data.variants !== undefined ? 'replace' : null,
        status: 'PENDING',
      },
    });
    res.status(201).json({ change: parseChange(change) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Vendor lists their own change requests.
// Supports ?status=PENDING|APPROVED|REJECTED, ?limit=&?offset= — returns { changes, total, limit, offset }.
router.get('/mine', requireAuth, requireApprovedVendor, async (req, res, next) => {
  try {
    const { status } = req.query;
    const limit = req.query.limit ? Math.max(1, Math.min(200, Number(req.query.limit) || 50)) : 50;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset) || 0) : 0;
    const where = { vendorId: req.user.vendor.id };
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(String(status))) {
      where.status = String(status);
    }
    const [changes, total] = await Promise.all([
      prisma.productChange.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          product: { select: { id: true, name: true, imageUrls: true } },
          reviewedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.productChange.count({ where }),
    ]);
    res.json({ changes: changes.map(parseChange), total, limit, offset });
  } catch (err) { next(err); }
});

// Admin lists all change requests.
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const where = {};
    if (status) where.status = status;
    const changes = await prisma.productChange.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, businessName: true } },
        product: { select: { id: true, name: true, imageUrls: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({ changes: changes.map(parseChange) });
  } catch (err) { next(err); }
});

// Admin approves a change — applies the proposed payload to live data.
router.post('/:id/approve', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { adminNote } = adminReview.parse(req.body || {});
    const change = await prisma.productChange.findUnique({
      where: { id: req.params.id },
      include: { vendor: true },
    });
    if (!change) return res.status(404).json({ error: 'NOT_FOUND' });
    if (change.status !== 'PENDING') return res.status(409).json({ error: 'ALREADY_REVIEWED' });

    const result = await prisma.$transaction(async (tx) => {
      let appliedProductId = change.productId;

      if (change.action === 'CREATE') {
        // If the vendor proposed variants, Product.stock is the sum —
        // else the legacy proposedStock is used.
        let proposedVariants = [];
        try {
          if (change.proposedVariants) proposedVariants = JSON.parse(change.proposedVariants);
        } catch { /* ignore */ }
        const stock = Array.isArray(proposedVariants) && proposedVariants.length > 0
          ? proposedVariants.reduce((s, v) => s + (typeof v.stock === 'number' ? v.stock : 0), 0)
          : (change.proposedStock ?? 0);
        const created = await tx.product.create({
          data: {
            vendorId: change.vendorId,
            name: change.proposedName,
            description: change.proposedDescription || '',
            priceCents: change.proposedPriceCents ?? 0,
            category: change.proposedCategory || 'Uncategorized',
            imageUrls: change.proposedImageUrls || '[]',
            stock,
            status: change.proposedStatus || 'LIVE',
          },
        });
        if (Array.isArray(proposedVariants) && proposedVariants.length > 0) {
          await applyVariants(tx, created.id, proposedVariants);
        }
        appliedProductId = created.id;
      } else if (change.action === 'UPDATE') {
        // Build the update payload from non-null proposed fields only.
        const data = {};
        if (change.proposedName !== null) data.name = change.proposedName;
        if (change.proposedDescription !== null) data.description = change.proposedDescription;
        if (change.proposedPriceCents !== null) data.priceCents = change.proposedPriceCents;
        if (change.proposedCategory !== null) data.category = change.proposedCategory;
        if (change.proposedImageUrls !== null) data.imageUrls = change.proposedImageUrls;
        if (change.proposedStock !== null) data.stock = change.proposedStock;
        if (change.proposedStatus !== null) data.status = change.proposedStatus;
        // Variants: when the vendor set proposedVariants, replace the
        // existing variant set (variantsAction='replace') and recompute
        // Product.stock to keep the storefront's "in stock" filter honest.
        let proposedVariants = null;
        if (typeof change.proposedVariants === 'string' && change.proposedVariants) {
          try { proposedVariants = JSON.parse(change.proposedVariants); }
          catch { proposedVariants = []; }
        }
        if (Array.isArray(proposedVariants)) {
          if (proposedVariants.length > 0) {
            data.stock = proposedVariants.reduce((s, v) => s + (typeof v.stock === 'number' ? v.stock : 0), 0);
          } else {
            // Empty list — drop all variants. Stock is intentionally
            // untouched here so a vendor clearing variants doesn't
            // silently zero their inventory.
            data.stock = change.proposedStock ?? 0;
          }
        }
        await tx.product.update({ where: { id: change.productId }, data });
        if (Array.isArray(proposedVariants)) {
          await applyVariants(tx, change.productId, proposedVariants);
        }
      } else if (change.action === 'DELETE') {
        // Preserve order history by hiding instead of hard-deleting.
        const ordered = await tx.orderItem.findFirst({ where: { productId: change.productId } });
        if (ordered) {
          await tx.product.update({ where: { id: change.productId }, data: { status: 'HIDDEN' } });
        } else {
          await tx.product.delete({ where: { id: change.productId } });
        }
      }

      const updated = await tx.productChange.update({
        where: { id: change.id },
        data: {
          status: 'APPROVED',
          reviewedById: req.user.id,
          reviewedAt: new Date(),
          adminNote: adminNote || null,
          productId: appliedProductId,
        },
        include: {
          vendor: { select: { id: true, businessName: true } },
          product: { select: { id: true, name: true } },
        },
      });
      return updated;
    });

    // Fan out the catalogue change to every connected client (customer +
    // admin + partner) BEFORE the vendor's personal "approved" ping, so
    // a list page subscribed via useNotificationStream refetches in sync
    // with the inbox bell. Re-read the product with the vendor relation so
    // notifyProductChange can include it in the SSE/catalog payload.
    let productForFanout = null;
    if (result.productId) {
      productForFanout = await prisma.product.findUnique({
        where: { id: result.productId },
        include: {
          vendor: { select: { userId: true } },
          variants: { select: { id: true, color: true, size: true, stock: true } },
        },
      });
    }
    if (productForFanout) {
      const action = change.action === 'CREATE' ? 'create'
                    : change.action === 'UPDATE' ? 'update'
                    : 'delete';
      await notifyProductChange({ action, product: productForFanout });
    }

    await audit(req.user.id, {
      action: change.action === 'CREATE' ? 'product.create'
            : change.action === 'UPDATE' ? 'product.update'
            : 'product.delete',
      entityType: 'product',
      entityId: result.productId,
      meta: { changeId: change.id, vendorId: change.vendorId },
    });

    // Notify the vendor that their change was approved.
    const vendorUser = await prisma.user.findUnique({
      where: { id: change.vendor.userId },
      select: { id: true },
    });
    if (vendorUser) {
      const productName = result.product?.name || change.proposedName || 'your product';
      await notify(vendorUser.id, {
        kind: 'product_approved',
        title: `Product change approved: ${productName}`,
        body: `Your ${change.action.toLowerCase()} request was approved${adminNote ? `. Note: ${adminNote}` : '.'}`,
        link: '/vendor/products',
        meta: { changeId: change.id, productId: result.productId, action: change.action },
      });
    }

    res.json({ change: parseChange(result) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Admin rejects a change — leaves live data untouched.
router.post('/:id/reject', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { adminNote } = adminReview.parse(req.body || {});
    if (!adminNote || !adminNote.trim()) {
      return res.status(400).json({ error: 'NOTE_REQUIRED' });
    }
    const change = await prisma.productChange.findUnique({ where: { id: req.params.id } });
    if (!change) return res.status(404).json({ error: 'NOT_FOUND' });
    if (change.status !== 'PENDING') return res.status(409).json({ error: 'ALREADY_REVIEWED' });

    const updated = await prisma.productChange.update({
      where: { id: change.id },
      data: {
        status: 'REJECTED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        adminNote: adminNote.trim(),
      },
      include: { vendor: { select: { id: true, userId: true, businessName: true } } },
    });

    await audit(req.user.id, {
      action: 'product.reject',
      entityType: 'product',
      entityId: change.productId,
      meta: { changeId: change.id, vendorId: change.vendorId, adminNote: adminNote.trim() },
    });

    if (updated.vendor) {
      const product = change.productId
        ? await prisma.product.findUnique({ where: { id: change.productId }, select: { name: true } })
        : null;
      const productName = product?.name || change.proposedName || 'your product';
      await notify(updated.vendor.userId, {
        kind: 'product_rejected',
        title: `Product change rejected: ${productName}`,
        body: `Reason: ${adminNote.trim()}`,
        link: '/vendor/products',
        meta: { changeId: change.id, productId: change.productId, action: change.action },
      });
    }

    res.json({ change: parseChange(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;