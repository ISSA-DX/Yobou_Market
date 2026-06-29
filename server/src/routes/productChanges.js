const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { productChangeCreate, adminReview } = require('../lib/validators');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { notify, audit } = require('../lib/notifications');

const router = express.Router();

// Parses the JSON-stored proposedImageUrls string back to an array on read.
function parseChange(change) {
  if (!change || typeof change.proposedImageUrls !== 'string') return change;
  let imgs = [];
  try { imgs = JSON.parse(change.proposedImageUrls); } catch { imgs = []; }
  return { ...change, proposedImageUrls: imgs };
}

function stringifyImageUrls(arr) {
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
        const created = await tx.product.create({
          data: {
            vendorId: change.vendorId,
            name: change.proposedName,
            description: change.proposedDescription || '',
            priceCents: change.proposedPriceCents ?? 0,
            category: change.proposedCategory || 'Uncategorized',
            imageUrls: change.proposedImageUrls || '[]',
            stock: change.proposedStock ?? 0,
            status: change.proposedStatus || 'LIVE',
          },
        });
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
        await tx.product.update({ where: { id: change.productId }, data });
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