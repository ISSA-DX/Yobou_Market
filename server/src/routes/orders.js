const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { orderCreate, orderStatus, orderCancel, orderShip } = require('../lib/validators');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { pay } = require('../lib/paymentSimulator');
const { notifyOrderAudience, audit } = require('../lib/notifications');

const router = express.Router();

const STATUS_ORDER = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'REFUNDED'];

const SHIPPING_CENTS = 499;
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

function statusIndex(status) {
  return STATUS_ORDER.indexOf(status);
}

function parseProductImages(product) {
  if (!product || typeof product.imageUrls !== 'string') return product;
  try {
    return { ...product, imageUrls: JSON.parse(product.imageUrls) };
  } catch {
    return { ...product, imageUrls: [] };
  }
}

function parseOrder(order) {
  if (!order?.items) return order;
  return {
    ...order,
    items: order.items.map((i) => ({ ...i, product: parseProductImages(i.product) })),
  };
}

function shippingFromSubtotal(subtotal) {
  return subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS;
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 100));
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: {
        items: { include: { product: true } },
        timeline: { orderBy: { at: 'asc' } },
        address: true,
        refunds: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ orders: orders.map(parseOrder) });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { product: true } },
        timeline: { orderBy: { at: 'asc' } },
        user: { select: { id: true, name: true, email: true } },
        address: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    const isOwner = order.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    const isVendor =
      req.user.role === 'VENDOR' &&
      order.items.some((i) => i.product.vendorId === req.user.vendor?.id);
    if (!isOwner && !isAdmin && !isVendor) return res.status(403).json({ error: 'FORBIDDEN' });
    res.json({ order: parseOrder(order) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = orderCreate.parse(req.body);

    // Address must exist and belong to the current user.
    const address = await prisma.address.findFirst({
      where: { id: data.addressId, userId: req.user.id },
    });
    if (!address) return res.status(400).json({ error: 'ADDRESS_INVALID' });

    const items = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { product: true },
    });
    if (items.length === 0) return res.status(400).json({ error: 'CART_EMPTY' });

    // Stock validation.
    for (const item of items) {
      if (item.product.status !== 'LIVE') {
        return res.status(400).json({ error: 'PRODUCT_NOT_AVAILABLE', productId: item.product.id });
      }
      if (item.product.stock < item.quantity) {
        return res.status(400).json({
          error: 'INSUFFICIENT_STOCK',
          productId: item.product.id,
          available: item.product.stock,
          requested: item.quantity,
        });
      }
    }

    const subtotalCents = items.reduce((s, i) => s + i.product.priceCents * i.quantity, 0);
    const shippingCents = shippingFromSubtotal(subtotalCents);
    const totalCents = subtotalCents + shippingCents;

    const result = await pay({
      method: data.paymentMethod,
      amountCents: totalCents,
      card: data.card,
    });

    if (!result.ok) {
      return res.status(402).json({ error: 'PAYMENT_FAILED', payment: result });
    }

    const initialStatus = data.paymentMethod === 'COD' ? 'PLACED' : 'PAID';

    const order = await prisma.$transaction(async (tx) => {
      // Decrement stock for successful orders.
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      const created = await tx.order.create({
        data: {
          userId: req.user.id,
          addressId: data.addressId,
          subtotalCents,
          shippingCents,
          totalCents,
          paymentMethod: data.paymentMethod,
          paymentTxnId: result.txnId,
          status: initialStatus,
          snapshotName: address.recipientName || req.user.name,
          snapshotLine1: address.line1,
          snapshotCity: address.city,
          snapshotState: address.state,
          snapshotPostal: address.postal,
          items: {
            create: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              priceCents: i.product.priceCents,
            })),
          },
          timeline: {
            create: [
              { status: 'PLACED', actorRole: 'SYSTEM' },
              ...(initialStatus !== 'PLACED' ? [{ status: initialStatus, actorRole: 'SYSTEM' }] : []),
            ],
          },
        },
        include: {
          items: { include: { product: true } },
          timeline: true,
          address: true,
        },
      });

      await tx.cartItem.deleteMany({ where: { userId: req.user.id } });

      return created;
    });

    // Notify vendors of the new order (customer notification is in-app;
    // we send a 'order_placed' notification to each vendor for the new
    // order they need to fulfill).
    notifyOrderAudience(order, {
      kind: 'order_placed',
      title: 'New order received',
      body: `Order #${order.id.slice(-6).toUpperCase()} placed (${(order.totalCents / 100).toFixed(2)} total).`,
      link: `/orders/${order.id}/track`,
      meta: { orderId: order.id, status: order.status, totalCents: order.totalCents },
    }).catch((err) => console.error('[notifyOrderAudience]', err));

    res.status(201).json({ order: parseOrder(order), payment: result });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/**
 * Admin or vendor advances the order along the lifecycle state machine.
 * PATCH /api/orders/:id/status
 *
 * Body: { status, note? }
 *
 * Vendor restrictions: cannot set DELIVERED or CANCELLED. Cannot act on
 * PLACED orders unless payment is COD. Cannot transition backwards.
 *
 * Admin: can set any forward status, plus CANCELLED (handled by the
 * dedicated /api/admin/orders/:id/cancel endpoint to capture a reason).
 * Admin can set REFUNDED only via the refund-approval flow.
 */
router.patch('/:id/status', requireRole('ADMIN', 'VENDOR'), async (req, res, next) => {
  try {
    const data = orderStatus.parse(req.body);
    if (data.status === 'REFUNDED') {
      return res.status(400).json({ error: 'USE_REFUND_FLOW' });
    }
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }

    // State machine: forward only. CANCELLED is no longer routed here —
    // use POST /api/admin/orders/:id/cancel for the admin cancel flow
    // with a mandatory reason.
    if (data.status === 'CANCELLED') {
      return res.status(400).json({ error: 'USE_CANCEL_ENDPOINT' });
    }

    const currentIdx = statusIndex(order.status);
    const nextIdx = statusIndex(data.status);
    if (order.status !== data.status && (nextIdx < currentIdx || nextIdx === -1)) {
      return res.status(400).json({ error: 'INVALID_STATUS_TRANSITION' });
    }

    if (req.user.role === 'VENDOR') {
      if (!req.user.vendor || req.user.vendor.status !== 'APPROVED') {
        return res.status(403).json({ error: 'VENDOR_PENDING' });
      }
      const ownsAny = order.items.some((i) => i.product.vendorId === req.user.vendor.id);
      if (!ownsAny) return res.status(403).json({ error: 'FORBIDDEN' });
      const allowedBaseStatuses =
        order.paymentMethod === 'COD'
          ? ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED']
          : ['PAID', 'PROCESSING', 'SHIPPED'];
      if (!allowedBaseStatuses.includes(order.status)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
      // Vendors shouldn't be hitting this endpoint with DELIVERED anyway
      // (use /api/orders/vendor/:id/deliver for that), but defend in depth.
      if (['DELIVERED'].includes(data.status)) {
        return res.status(403).json({ error: 'USE_DELIVER_ENDPOINT' });
      }
    }

    const note = req.body?.note ? String(req.body.note).slice(0, 500) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: req.params.id },
        data: {
          status: data.status,
          timeline: {
            create: {
              status: data.status,
              actorId: req.user.id,
              actorRole: req.user.role,
              note,
            },
          },
        },
        include: { items: { include: { product: { include: { vendor: true } } } }, timeline: { orderBy: { at: 'asc' } } },
      });
      // For SHIPPED transitions via the bare status endpoint, we don't
      // have a tracking number — fall back to "no carrier". Use the
      // dedicated ship endpoint to attach tracking.
      if (data.status === 'SHIPPED' && !result.shippedAt) {
        await tx.order.update({
          where: { id: result.id },
          data: { shippedAt: new Date() },
        });
      }
      await notifyOrderAudience(result, {
        kind: 'order_status',
        title: statusTitle(data.status),
        body: statusBody(data.status, result.id),
        link: `/orders/${result.id}/track`,
        meta: { orderId: result.id, status: data.status, note },
      }, tx);
      return result;
    });

    if (req.user.role === 'ADMIN') {
      await audit(req.user.id, {
        action: 'order.status',
        entityType: 'order',
        entityId: updated.id,
        meta: { status: data.status, note },
      });
    }

    res.json({ order: parseOrder(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Admin-only cancel — restores stock by default, requires reason.
// ---------------------------------------------------------------------------
router.post('/:id/cancel', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = orderCancel.parse(req.body);
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.restoreStock) {
        for (const item of order.items) {
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
              actorRole: 'ADMIN',
              note: data.reason,
            },
          },
        },
        include: { items: { include: { product: { include: { vendor: true } } } }, timeline: { orderBy: { at: 'asc' } } },
      });
      // Fan out notifications on the SAME connection so we don't hit the
      // pool-snapshot race. Notify is fire-and-forget for SSE push, but the
      // notification rows are written here in-tx.
      await notifyOrderAudience(orderUpdate, {
        kind: 'order_cancelled',
        title: 'Order cancelled',
        body: `Order #${orderUpdate.id.slice(-6).toUpperCase()} was cancelled. Reason: ${data.reason}`,
        link: `/orders/${orderUpdate.id}/track`,
        meta: { orderId: orderUpdate.id, reason: data.reason },
      }, tx);
      return orderUpdate;
    });

    await audit(req.user.id, {
      action: 'order.cancel',
      entityType: 'order',
      entityId: updated.id,
      meta: { reason: data.reason, restoreStock: data.restoreStock },
    });

    res.json({ order: parseOrder(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Ship — transition PROCESSING → SHIPPED with tracking details. Vendor or admin.
// ---------------------------------------------------------------------------
router.post('/:id/ship', requireRole('ADMIN', 'VENDOR'), async (req, res, next) => {
  try {
    const data = orderShip.parse(req.body);
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }
    if (order.status !== 'PROCESSING' && order.status !== 'PAID') {
      return res.status(400).json({ error: 'NOT_READY_TO_SHIP', currentStatus: order.status });
    }

    if (req.user.role === 'VENDOR') {
      if (!req.user.vendor || req.user.vendor.status !== 'APPROVED') {
        return res.status(403).json({ error: 'VENDOR_PENDING' });
      }
      const ownsAny = order.items.some((i) => i.product.vendorId === req.user.vendor.id);
      if (!ownsAny) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const estimatedDelivery = data.estimatedDelivery ? new Date(data.estimatedDelivery) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
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
              actorRole: req.user.role,
              note: data.note || `Shipped via ${data.carrier}: ${data.trackingNumber}`,
            },
          },
        },
        include: { items: { include: { product: { include: { vendor: true } } } }, timeline: { orderBy: { at: 'asc' } } },
      });
      await notifyOrderAudience(result, {
        kind: 'tracking_updated',
        title: 'Your order is on its way',
        body: `Tracking via ${data.carrier}: ${data.trackingNumber}`,
        link: `/orders/${result.id}/track`,
        meta: { orderId: result.id, carrier: data.carrier, trackingNumber: data.trackingNumber, estimatedDelivery },
      }, tx);
      return result;
    });

    if (req.user.role === 'ADMIN') {
      await audit(req.user.id, {
        action: 'order.ship',
        entityType: 'order',
        entityId: updated.id,
        meta: { carrier: data.carrier, trackingNumber: data.trackingNumber },
      });
    }

    res.json({ order: parseOrder(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Mark DELIVERED — admin or vendor of the order. No state machine needed
// because DELIVERED is terminal and not from the state-array. Use this
// instead of PATCH /:id/status with status=DELIVERED so vendors can
// complete their own orders.
// ---------------------------------------------------------------------------
router.post('/:id/deliver', requireRole('ADMIN', 'VENDOR'), async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }
    if (order.status !== 'SHIPPED') {
      return res.status(400).json({ error: 'NOT_SHIPPED', currentStatus: order.status });
    }
    if (req.user.role === 'VENDOR') {
      if (!req.user.vendor || req.user.vendor.status !== 'APPROVED') {
        return res.status(403).json({ error: 'VENDOR_PENDING' });
      }
      const ownsAny = order.items.some((i) => i.product.vendorId === req.user.vendor.id);
      if (!ownsAny) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'DELIVERED',
          timeline: {
            create: {
              status: 'DELIVERED',
              actorId: req.user.id,
              actorRole: req.user.role,
            },
          },
        },
        include: { items: { include: { product: { include: { vendor: true } } } }, timeline: { orderBy: { at: 'asc' } } },
      });
      await notifyOrderAudience(result, {
        kind: 'order_status',
        title: 'Order delivered',
        body: `Order #${result.id.slice(-6).toUpperCase()} has been delivered.`,
        link: `/orders/${result.id}/track`,
        meta: { orderId: result.id, status: 'DELIVERED' },
      }, tx);
      return result;
    });

    if (req.user.role === 'ADMIN') {
      await audit(req.user.id, {
        action: 'order.status',
        entityType: 'order',
        entityId: updated.id,
        meta: { status: 'DELIVERED' },
      });
    }

    res.json({ order: parseOrder(updated) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// helpers for notification text
// ---------------------------------------------------------------------------
function statusTitle(status) {
  return {
    PAID: 'Payment confirmed',
    PROCESSING: 'Order being prepared',
    SHIPPED: 'Order shipped',
    DELIVERED: 'Order delivered',
    CANCELLED: 'Order cancelled',
  }[status] || `Order status: ${status}`;
}

function statusBody(status, orderId) {
  const short = `#${orderId.slice(-6).toUpperCase()}`;
  return {
    PAID: `Order ${short} payment confirmed.`,
    PROCESSING: `Order ${short} is being prepared.`,
    SHIPPED: `Order ${short} has shipped.`,
    DELIVERED: `Order ${short} has been delivered.`,
    CANCELLED: `Order ${short} was cancelled.`,
  }[status] || `Order ${short} status: ${status}`;
}

module.exports = router;