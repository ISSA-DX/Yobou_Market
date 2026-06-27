const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { orderCreate, orderStatus } = require('../lib/validators');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { pay } = require('../lib/paymentSimulator');

const router = express.Router();

const STATUS_ORDER = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'];

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
              { status: 'PLACED' },
              ...(initialStatus !== 'PLACED' ? [{ status: initialStatus }] : []),
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

    res.status(201).json({ order: parseOrder(order), payment: result });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.patch('/:id/status', requireRole('ADMIN', 'VENDOR'), async (req, res, next) => {
  try {
    const data = orderStatus.parse(req.body);
    // REFUNDED is reserved for the refund-approval flow, not a manual transition.
    if (data.status === 'REFUNDED') {
      return res.status(400).json({ error: 'USE_REFUND_FLOW' });
    }
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } } },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    // Can't change terminal statuses.
    if (TERMINAL_STATUSES.includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }

    // State machine: allow same status or forward progress only.
    const currentIdx = statusIndex(order.status);
    const nextIdx = statusIndex(data.status);
    if (order.status !== data.status && (nextIdx < currentIdx || nextIdx === -1)) {
      return res.status(400).json({ error: 'INVALID_STATUS_TRANSITION' });
    }

    if (req.user.role === 'VENDOR') {
      // Only approved vendors may update orders.
      if (!req.user.vendor || req.user.vendor.status !== 'APPROVED') {
        return res.status(403).json({ error: 'VENDOR_PENDING' });
      }
      const ownsAny = order.items.some((i) => i.product.vendorId === req.user.vendor.id);
      if (!ownsAny) return res.status(403).json({ error: 'FORBIDDEN' });
      // Vendors may act on paid orders, and on COD orders that are placed.
      const allowedBaseStatuses =
        order.paymentMethod === 'COD'
          ? ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED']
          : ['PAID', 'PROCESSING', 'SHIPPED'];
      if (!allowedBaseStatuses.includes(order.status)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
      // Vendors can't mark DELIVERED or CANCELLED.
      if (['DELIVERED', 'CANCELLED'].includes(data.status)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const shouldRestoreStock = data.status === 'CANCELLED' && !TERMINAL_STATUSES.includes(order.status);

    const updated = await prisma.$transaction(async (tx) => {
      if (shouldRestoreStock) {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      return tx.order.update({
        where: { id: req.params.id },
        data: {
          status: data.status,
          timeline: { create: { status: data.status } },
        },
        include: { items: true, timeline: { orderBy: { at: 'asc' } } },
      });
    });

    res.json({ order: parseOrder(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;
