/**
 * Courier-facing delivery endpoints. Mounted at /api/driver/*.
 *
 *   GET  /api/driver/deliveries                ?scope=active|done — own jobs only
 *   POST /api/driver/deliveries/:id/pickup     ASSIGNED → PICKED_UP, order → SHIPPED
 *   POST /api/driver/deliveries/:id/deliver    PICKED_UP → DELIVERED, order → DELIVERED
 *   POST /api/driver/deliveries/:id/fail       PICKED_UP → FAILED (admin re-assigns)
 *
 * Auth: role=DRIVER. A courier only ever sees and touches deliveries
 * assigned to them; anything else is a 404 so job IDs don't leak.
 * Jobs are created/assigned by admins — see routes/deliveries.js.
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole } = require('../auth/middleware');
const { notify, notifyOrderAudience, notifyMany } = require('../lib/notifications');
const { recordLocation, setDuty } = require('../lib/tracking');
const { recordEarnings } = require('../lib/ledger');

const router = express.Router();
router.use(requireAuth, requireRole('DRIVER'));

const ORDER_INCLUDE = {
  items: { include: { product: { include: { vendor: true } } } },
  timeline: { orderBy: { at: 'asc' } },
};

const shortId = (id) => `#${id.slice(-6).toUpperCase()}`;

// Shape a delivery for the courier: drop-off address + what to carry +
// how much cash to collect. Customer email and payment details stay hidden.
function present(d) {
  const o = d.order;
  return {
    id: d.id,
    status: d.status,
    codAmountCents: d.codAmountCents,
    codCollectedCents: d.codCollectedCents,
    recipientName: d.recipientName,
    proofNote: d.proofNote,
    failReason: d.failReason,
    attempts: d.attempts,
    assignedAt: d.assignedAt,
    pickedUpAt: d.pickedUpAt,
    deliveredAt: d.deliveredAt,
    order: {
      id: o.id,
      status: o.status,
      paymentMethod: o.paymentMethod,
      totalCents: o.totalCents,
      createdAt: o.createdAt,
      customerName: o.snapshotName || o.user?.name || null,
      address: {
        line1: o.snapshotLine1 || o.address?.line1 || '',
        city: o.snapshotCity || o.address?.city || '',
        state: o.snapshotState || o.address?.state || '',
        postal: o.snapshotPostal || o.address?.postal || '',
      },
      items: (o.items || []).map((i) => ({
        id: i.id,
        name: i.product?.name || 'Item',
        quantity: i.quantity,
        pickupFrom: i.product?.vendor?.businessName || 'Yobou Direct',
      })),
    },
  };
}

async function loadOwn(req) {
  const d = await prisma.delivery.findUnique({ where: { id: req.params.id } });
  if (!d || d.driverId !== req.user.id) return null;
  return d;
}

async function reload(id) {
  const d = await prisma.delivery.findUnique({
    where: { id },
    include: {
      order: { include: { items: { include: { product: { include: { vendor: true } } } }, user: { select: { name: true } }, address: true } },
    },
  });
  return present(d);
}

router.get('/deliveries', async (req, res, next) => {
  try {
    const scope = req.query.scope === 'done' ? 'done' : 'active';
    const where = {
      driverId: req.user.id,
      status: scope === 'done' ? { in: ['DELIVERED', 'FAILED'] } : { in: ['ASSIGNED', 'PICKED_UP'] },
      // A job whose order was cancelled meanwhile is no longer actionable.
      ...(scope === 'active' ? { order: { status: { notIn: ['CANCELLED', 'REFUNDED'] } } } : {}),
    };
    const rows = await prisma.delivery.findMany({
      where,
      orderBy: scope === 'done' ? { updatedAt: 'desc' } : { assignedAt: 'asc' },
      take: 100,
      include: {
        order: { include: { items: { include: { product: { include: { vendor: true } } } }, user: { select: { name: true } }, address: true } },
      },
    });
    const [deliveredToday, codHeld, loc, unsettled, rating] = await Promise.all([
      prisma.delivery.count({
        where: { driverId: req.user.id, status: 'DELIVERED', deliveredAt: { gte: startOfToday() } },
      }),
      prisma.delivery.aggregate({
        where: { driverId: req.user.id, status: 'DELIVERED', deliveredAt: { gte: startOfToday() } },
        _sum: { codCollectedCents: true },
      }),
      prisma.driverLocation.findUnique({ where: { driverId: req.user.id } }),
      // Cash collected at the door but not yet handed in to Yobou.
      prisma.delivery.aggregate({
        where: { driverId: req.user.id, status: 'DELIVERED', cashSettledAt: null, codCollectedCents: { gt: 0 } },
        _sum: { codCollectedCents: true },
      }),
      prisma.delivery.aggregate({
        where: { driverId: req.user.id, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);
    res.json({
      deliveries: rows.map(present),
      stats: {
        deliveredToday,
        codCollectedTodayCents: codHeld._sum.codCollectedCents || 0,
        cashToHandInCents: unsettled._sum.codCollectedCents || 0,
        avgRating: rating._avg.rating,
        ratingCount: rating._count.rating,
      },
      onDuty: Boolean(loc?.onDuty),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Live GPS. The courier app posts a fix every few seconds while on duty;
// see lib/tracking.js for who gets to see it.
// ---------------------------------------------------------------------------
const locationBody = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(100000).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  speed: z.number().nonnegative().max(100).nullable().optional(),
});

router.post('/location', async (req, res, next) => {
  try {
    const fix = locationBody.parse(req.body || {});
    res.json(await recordLocation(req.user, fix));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.post('/duty', async (req, res, next) => {
  try {
    const { onDuty } = z.object({ onDuty: z.boolean() }).parse(req.body || {});
    res.json(await setDuty(req.user, onDuty));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

router.post('/deliveries/:id/pickup', async (req, res, next) => {
  try {
    const d = await loadOwn(req);
    if (!d) return res.status(404).json({ error: 'NOT_FOUND' });
    if (d.status !== 'ASSIGNED') return res.status(409).json({ error: 'INVALID_DELIVERY_STATE', currentStatus: d.status });
    const order = await prisma.order.findUnique({ where: { id: d.orderId } });
    if (['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
      return res.status(409).json({ error: 'ORDER_ALREADY_FINAL' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({ where: { id: d.id }, data: { status: 'PICKED_UP', pickedUpAt: new Date() } });
      const updated = await tx.order.update({
        where: { id: d.orderId },
        data: {
          status: 'SHIPPED',
          carrier: 'YobouDirect',
          trackingNumber: order.trackingNumber || `YB-${d.id.slice(-8).toUpperCase()}`,
          shippedAt: order.shippedAt || new Date(),
          timeline: {
            create: {
              status: 'SHIPPED',
              actorId: req.user.id,
              actorRole: 'DRIVER',
              note: `Out for delivery with ${req.user.name}`,
            },
          },
        },
        include: ORDER_INCLUDE,
      });
      await notifyOrderAudience(updated, {
        kind: 'tracking_updated',
        title: 'Out for delivery',
        body: `Order ${shortId(updated.id)} is on its way with courier ${req.user.name}.`,
        link: `/orders/${updated.id}/track`,
        meta: { orderId: updated.id, deliveryId: d.id, status: 'SHIPPED' },
      }, tx);
    });
    // The delivery code goes to the customer only (never to vendors/admins' inbox).
    if (d.deliveryCode) {
      await notify(order.userId, {
        kind: 'tracking_updated',
        title: `Your delivery code: ${d.deliveryCode}`,
        body: `Give this code to the courier when your order ${shortId(order.id)} arrives.`,
        link: `/orders/${order.id}/track`,
        meta: { orderId: order.id, deliveryId: d.id },
      });
    }
    res.json({ delivery: await reload(d.id) });
  } catch (err) { next(err); }
});

const deliverBody = z.object({
  recipientName: z.string().trim().min(1).max(120).optional(),
  proofNote: z.string().trim().max(500).optional(),
  codCollectedCents: z.number().int().nonnegative().optional(),
  // Courier's GPS at hand-over — stored as proof of delivery.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // The customer's 4-digit delivery code (shown on their Track Order page).
  code: z.string().trim().max(10).optional(),
});

router.post('/deliveries/:id/deliver', async (req, res, next) => {
  try {
    const data = deliverBody.parse(req.body || {});
    const d = await loadOwn(req);
    if (!d) return res.status(404).json({ error: 'NOT_FOUND' });
    if (d.status !== 'PICKED_UP') return res.status(409).json({ error: 'INVALID_DELIVERY_STATE', currentStatus: d.status });
    if (d.deliveryCode && data.code !== d.deliveryCode) {
      return res.status(400).json({ error: 'INVALID_DELIVERY_CODE' });
    }
    // Cash-on-delivery: the courier must confirm they collected the full amount.
    if (d.codAmountCents > 0 && (data.codCollectedCents ?? 0) < d.codAmountCents) {
      return res.status(400).json({ error: 'COD_AMOUNT_SHORT', codAmountCents: d.codAmountCents });
    }

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: d.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          recipientName: data.recipientName || null,
          proofNote: data.proofNote || null,
          codCollectedCents: d.codAmountCents > 0 ? data.codCollectedCents : null,
          deliveredLat: data.lat ?? null,
          deliveredLng: data.lng ?? null,
          failReason: null,
        },
      });
      const order = await tx.order.findUnique({ where: { id: d.orderId } });
      const updated = await tx.order.update({
        where: { id: d.orderId },
        data: {
          status: 'DELIVERED',
          // COD orders become paid at the door.
          paymentTxnId: order.paymentMethod === 'COD' && !order.paymentTxnId ? `COD-${d.id.slice(-8).toUpperCase()}` : undefined,
          timeline: {
            create: {
              status: 'DELIVERED',
              actorId: req.user.id,
              actorRole: 'DRIVER',
              note: [
                data.recipientName ? `Received by ${data.recipientName}` : null,
                d.codAmountCents > 0 ? 'Cash collected on delivery' : null,
                data.proofNote || null,
              ].filter(Boolean).join(' · ') || null,
            },
          },
        },
        include: ORDER_INCLUDE,
      });
      await recordEarnings(tx, d.orderId);
      await notifyOrderAudience(updated, {
        kind: 'order_status',
        title: 'Order delivered',
        body: `Order ${shortId(updated.id)} has been delivered.`,
        link: `/orders/${updated.id}/track`,
        meta: { orderId: updated.id, deliveryId: d.id, status: 'DELIVERED' },
      }, tx);
    });
    res.json({ delivery: await reload(d.id) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

const failBody = z.object({ reason: z.string().trim().min(3).max(300) });

router.post('/deliveries/:id/fail', async (req, res, next) => {
  try {
    const { reason } = failBody.parse(req.body || {});
    const d = await loadOwn(req);
    if (!d) return res.status(404).json({ error: 'NOT_FOUND' });
    if (d.status !== 'PICKED_UP') return res.status(409).json({ error: 'INVALID_DELIVERY_STATE', currentStatus: d.status });

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: d.id },
        data: { status: 'FAILED', failReason: reason, attempts: { increment: 1 } },
      });
      // Order stays SHIPPED (goods are with Yobou); the timeline records the attempt.
      await tx.timelineEvent.create({
        data: { orderId: d.orderId, status: 'SHIPPED', actorId: req.user.id, actorRole: 'DRIVER', note: `Delivery attempt failed: ${reason}` },
      });
    });
    const order = await prisma.order.findUnique({ where: { id: d.orderId }, select: { userId: true } });
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await notifyMany([order.userId, ...admins.map((a) => a.id)], {
      kind: 'order_status',
      title: 'Delivery attempt failed',
      body: `Order ${shortId(d.orderId)}: ${reason}. We'll try again soon.`,
      link: `/orders/${d.orderId}/track`,
      meta: { orderId: d.orderId, deliveryId: d.id, reason },
    });
    res.json({ delivery: await reload(d.id) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;
