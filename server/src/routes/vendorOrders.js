/**
 * Vendor-facing order endpoints. Mounted at /api/orders/vendor/*.
 *
 *   GET  /api/orders/vendor/mine          — orders containing the vendor's products
 *   POST /api/orders/vendor/:id/ship      — vendor ships their items (with tracking)
 *   POST /api/orders/vendor/:id/deliver   — vendor marks their items DELIVERED
 *   POST /api/orders/vendor/:id/cancel    — vendor cancels PAID/PROCESSING order
 *
 * Auth: requireApprovedVendor.
 *
 * These mirror the admin equivalents in orders.js but enforce that the
 * vendor actually owns at least one product in the order.
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireApprovedVendor } = require('../auth/middleware');
const { orderShip, orderCancel } = require('../lib/validators');
const { notifyOrderAudience, audit } = require('../lib/notifications');

const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'REFUNDED'];
// Vendors may only cancel orders that haven't shipped yet. Once an order
// has been handed to a carrier, the customer must use the refund flow.
const VENDOR_CANCEL_FROM = ['PAID', 'PROCESSING'];

const router = express.Router();
router.use(requireAuth, requireApprovedVendor);

function parseImages(p) {
  if (!p || typeof p.imageUrls !== 'string') return p;
  try { return { ...p, imageUrls: JSON.parse(p.imageUrls) }; } catch { return { ...p, imageUrls: [] }; }
}

router.get('/mine', async (req, res, next) => {
  try {
    const vendorId = req.user.vendor.id;
    const where = { items: { some: { product: { vendorId } } } };
    if (req.query.status) where.status = String(req.query.status);

    // Optional date range — createdAt >= from (inclusive) and < to+1day (exclusive end-of-day).
    const fromStr = req.query.from ? String(req.query.from) : null;
    const toStr = req.query.to ? String(req.query.to) : null;
    if (fromStr || toStr) {
      where.createdAt = {};
      if (fromStr) {
        const d = new Date(fromStr);
        if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (toStr) {
        const d = new Date(toStr);
        if (!Number.isNaN(d.getTime())) {
          // Treat `to` as inclusive end-of-day: bump to next day midnight.
          d.setUTCHours(23, 59, 59, 999);
          where.createdAt.lte = d;
        }
      }
    }

    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: { include: { product: true } },
          timeline: { orderBy: { at: 'asc' } },
          refunds: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);
    res.json({
      orders: rows.map((o) => ({
        ...o,
        items: o.items.map((i) => ({ ...i, product: parseImages(i.product) })),
      })),
      total, limit, offset,
    });
  } catch (err) { next(err); }
});

router.post('/:id/ship', async (req, res, next) => {
  try {
    const data = orderShip.parse(req.body);
    const vendorId = req.user.vendor.id;
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    const ownsAny = order.items.some((i) => i.product.vendorId === vendorId);
    if (!ownsAny) return res.status(403).json({ error: 'FORBIDDEN' });
    if (['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }
    if (order.status !== 'PROCESSING' && order.status !== 'PAID') {
      return res.status(400).json({ error: 'NOT_READY_TO_SHIP', currentStatus: order.status });
    }

    const estimatedDelivery = data.estimatedDelivery ? new Date(data.estimatedDelivery) : null;
    const updated = await prisma.$transaction(async (tx) => {
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'SHIPPED',
          trackingNumber: data.trackingNumber,
          carrier: data.carrier,
          shippedAt: new Date(),
          estimatedDelivery,
          timeline: {
            create: {
              status: 'SHIPPED',
              actorId: req.user.id,
              actorRole: 'VENDOR',
              note: data.note || `Shipped via ${data.carrier}: ${data.trackingNumber}`,
            },
          },
        },
        include: { items: { include: { product: true } }, timeline: { orderBy: { at: 'asc' } } },
      });
    });

    notifyOrderAudience(updated, {
      kind: 'tracking_updated',
      title: 'Your order is on its way',
      body: `Tracking via ${data.carrier}: ${data.trackingNumber}`,
      link: `/orders/${updated.id}/track`,
      meta: { orderId: updated.id, carrier: data.carrier, trackingNumber: data.trackingNumber },
    }).catch((err) => console.error('[notifyOrderAudience]', err));

    res.json({
      order: { ...updated, items: updated.items.map((i) => ({ ...i, product: parseImages(i.product) })) },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.post('/:id/deliver', async (req, res, next) => {
  try {
    const vendorId = req.user.vendor.id;
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    const ownsAny = order.items.some((i) => i.product.vendorId === vendorId);
    if (!ownsAny) return res.status(403).json({ error: 'FORBIDDEN' });
    if (['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }
    if (order.status !== 'SHIPPED') {
      return res.status(400).json({ error: 'NOT_SHIPPED', currentStatus: order.status });
    }

    const updated = await prisma.$transaction(async (tx) => {
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'DELIVERED',
          timeline: {
            create: {
              status: 'DELIVERED',
              actorId: req.user.id,
              actorRole: 'VENDOR',
            },
          },
        },
        include: { items: { include: { product: true } }, timeline: { orderBy: { at: 'asc' } } },
      });
    });

    notifyOrderAudience(updated, {
      kind: 'order_status',
      title: 'Order delivered',
      body: `Order #${updated.id.slice(-6).toUpperCase()} has been delivered.`,
      link: `/orders/${updated.id}/track`,
      meta: { orderId: updated.id, status: 'DELIVERED' },
    }).catch((err) => console.error('[notifyOrderAudience]', err));

    res.json({
      order: { ...updated, items: updated.items.map((i) => ({ ...i, product: parseImages(i.product) })) },
    });
  } catch (err) { next(err); }
});

// Vendor-initiated cancel: only allowed while the order is still PAID or
// PROCESSING. Once it ships, the customer must use the refund flow. The
// vendor must still own at least one line item. Stock is restored to the
// vendor's products by default (configurable via `restoreStock: false`).
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const data = orderCancel.parse(req.body);
    const vendorId = req.user.vendor.id;
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    const ownsAny = order.items.some((i) => i.product.vendorId === vendorId);
    if (!ownsAny) return res.status(403).json({ error: 'FORBIDDEN' });
    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }
    if (!VENDOR_CANCEL_FROM.includes(order.status)) {
      return res.status(400).json({
        error: 'NOT_CANCELLABLE_BY_VENDOR',
        currentStatus: order.status,
        hint: 'Vendors may only cancel orders that have not yet shipped',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.restoreStock) {
        // Only restore stock for the vendor's own products — we shouldn't
        // touch stock belonging to other vendors on the same order.
        for (const item of order.items) {
          if (item.product.vendorId !== vendorId) continue;
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
      const orderUpdate = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelReason: data.reason,
          cancelledBy: req.user.id,
          timeline: {
            create: {
              status: 'CANCELLED',
              actorId: req.user.id,
              actorRole: 'VENDOR',
              note: data.reason,
            },
          },
        },
        include: {
          items: { include: { product: { include: { vendor: true } } } },
          timeline: { orderBy: { at: 'asc' } },
        },
      });
      await notifyOrderAudience(orderUpdate, {
        kind: 'order_cancelled',
        title: 'Order cancelled',
        body: `Order #${orderUpdate.id.slice(-6).toUpperCase()} was cancelled. Reason: ${data.reason}`,
        link: `/orders/${orderUpdate.id}/track`,
        meta: { orderId: orderUpdate.id, reason: data.reason, cancelledBy: 'VENDOR' },
      }, tx);
      return orderUpdate;
    });

    await audit(req.user.id, {
      action: 'order.cancel',
      entityType: 'order',
      entityId: updated.id,
      meta: {
        reason: data.reason,
        restoreStock: data.restoreStock,
        actorRole: 'VENDOR',
      },
    });

    res.json({
      order: { ...updated, items: updated.items.map((i) => ({ ...i, product: parseImages(i.product) })) },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;
