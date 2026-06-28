const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { refundCreate, adminReview } = require('../lib/validators');
const { requireAuth, requireRole } = require('../auth/middleware');
const { notify, audit } = require('../lib/notifications');

const router = express.Router();

const REFUND_WINDOW_DAYS = Number(process.env.REFUND_WINDOW_DAYS || 15);
const REFUND_WINDOW_MS = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Customer requests a refund on a delivered order.
// Window: order must be DELIVERED and within REFUND_WINDOW_DAYS of delivery.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = refundCreate.parse(req.body);
    const order = await prisma.order.findUnique({
      where: { id: data.orderId },
      include: { refunds: true },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    if (order.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
    if (order.status !== 'DELIVERED') {
      return res.status(400).json({ error: 'ORDER_NOT_DELIVERED' });
    }

    const deliveredAt = order.updatedAt.getTime();
    if (Date.now() - deliveredAt > REFUND_WINDOW_MS) {
      return res.status(400).json({ error: 'REFUND_WINDOW_EXPIRED', windowDays: REFUND_WINDOW_DAYS });
    }

    // One non-rejected refund request per order — find any existing PENDING/APPROVED/PROCESSED.
    const existing = order.refunds.find((r) => r.status !== 'REJECTED');
    if (existing) return res.status(409).json({ error: 'REFUND_ALREADY_EXISTS', refundId: existing.id });

    const amountCents = Math.min(data.amountCents ?? order.totalCents, order.totalCents);

    const refund = await prisma.refund.create({
      data: {
        orderId: order.id,
        requestedById: req.user.id,
        reason: data.reason,
        amountCents,
        status: 'PENDING',
      },
    });
    res.status(201).json({ refund });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Customer lists their own refunds.
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const refunds = await prisma.refund.findMany({
      where: { requestedById: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        order: { select: { id: true, totalCents: true, status: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({ refunds });
  } catch (err) { next(err); }
});

// Admin lists all refunds; optional status filter.
router.get('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const where = {};
    if (status) where.status = status;
    const refunds = await prisma.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true, totalCents: true, status: true, userId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });
    res.json({ refunds });
  } catch (err) { next(err); }
});

// Admin approves a refund — flips order to REFUNDED, restores stock, stamps txn.
router.post('/:id/approve', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { adminNote } = adminReview.parse(req.body || {});
    const refund = await prisma.refund.findUnique({
      where: { id: req.params.id },
      include: { order: { include: { items: true } } },
    });
    if (!refund) return res.status(404).json({ error: 'NOT_FOUND' });
    if (refund.status !== 'PENDING') return res.status(409).json({ error: 'ALREADY_REVIEWED' });

    const refundTxnId = `sim_refund_${crypto.randomBytes(6).toString('hex')}`;

    const updated = await prisma.$transaction(async (tx) => {
      // Restore stock so the inventory reflects returned goods.
      for (const item of refund.order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      const approvedRefund = await tx.refund.update({
        where: { id: refund.id },
        data: {
          status: 'PROCESSED',
          reviewedById: req.user.id,
          reviewedAt: new Date(),
          adminNote: adminNote || null,
          refundTxnId,
        },
      });
      await tx.order.update({
        where: { id: refund.orderId },
        data: {
          status: 'REFUNDED',
          timeline: { create: { status: 'REFUNDED', actorId: req.user.id, actorRole: 'ADMIN' } },
        },
      });
      return approvedRefund;
    });

    await audit(req.user.id, {
      action: 'refund.approve',
      entityType: 'refund',
      entityId: updated.id,
      meta: { orderId: refund.orderId, amountCents: refund.amountCents },
    });

    // Notify the customer who requested the refund.
    const order = await prisma.order.findUnique({ where: { id: refund.orderId }, select: { userId: true } });
    if (order) {
      await notify(order.userId, {
        kind: 'order_status',
        title: 'Refund approved',
        body: `Your refund of $${(refund.amountCents / 100).toFixed(2)} has been processed.`,
        link: `/orders/${refund.orderId}/track`,
        meta: { orderId: refund.orderId, refundId: updated.id, status: 'REFUNDED' },
      });
    }

    res.json({ refund: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Admin rejects a refund request.
router.post('/:id/reject', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { adminNote } = adminReview.parse(req.body || {});
    if (!adminNote || !adminNote.trim()) {
      return res.status(400).json({ error: 'NOTE_REQUIRED' });
    }
    const refund = await prisma.refund.findUnique({
      where: { id: req.params.id },
      include: { order: { select: { id: true, userId: true } } },
    });
    if (!refund) return res.status(404).json({ error: 'NOT_FOUND' });
    if (refund.status !== 'PENDING') return res.status(409).json({ error: 'ALREADY_REVIEWED' });

    const updated = await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: 'REJECTED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        adminNote: adminNote.trim(),
      },
    });

    await audit(req.user.id, {
      action: 'refund.reject',
      entityType: 'refund',
      entityId: updated.id,
      meta: { orderId: refund.orderId, adminNote: adminNote.trim() },
    });

    if (refund.order) {
      await notify(refund.order.userId, {
        kind: 'order_status',
        title: 'Refund request rejected',
        body: `Your refund request was rejected. Reason: ${adminNote.trim()}`,
        link: `/orders/${refund.orderId}/track`,
        meta: { orderId: refund.orderId, refundId: updated.id, status: 'REJECTED' },
      });
    }

    res.json({ refund: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;