/**
 * Admin dispatch control plane. Mounted at /api/admin alongside admin.js.
 *
 *   GET  /api/admin/drivers                     couriers + workload
 *   POST /api/admin/drivers                     create a courier account
 *   GET  /api/admin/deliveries                  ?status=ASSIGNED|PICKED_UP|DELIVERED|FAILED
 *   GET  /api/admin/deliveries/queue            orders ready to dispatch (no courier yet, or failed)
 *   POST /api/admin/orders/:id/assign-driver    { driverId } — assign or re-assign
 *
 * The courier side of the lifecycle lives in routes/driver.js.
 */
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole } = require('../auth/middleware');
const { notify, audit } = require('../lib/notifications');
const { fleet, STALE_MS } = require('../lib/tracking');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

const DELIVERY_STATUSES = ['ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED'];
// Orders a courier can be sent for. COD orders stay PLACED until the door.
const DISPATCHABLE = {
  OR: [
    { status: { in: ['PAID', 'PROCESSING'] } },
    { status: 'PLACED', paymentMethod: 'COD' },
    // A failed attempt leaves the order SHIPPED with the goods at Yobou.
    { status: 'SHIPPED', delivery: { status: 'FAILED' } },
  ],
};

const shortId = (id) => `#${id.slice(-6).toUpperCase()}`;
const newDeliveryCode = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');

const orderSummary = {
  select: {
    id: true, status: true, paymentMethod: true, totalCents: true, createdAt: true,
    snapshotName: true, snapshotLine1: true, snapshotCity: true, snapshotState: true, snapshotPostal: true,
    user: { select: { id: true, name: true, email: true } },
    _count: { select: { items: true } },
  },
};

router.get('/drivers', async (_req, res, next) => {
  try {
    const drivers = await prisma.user.findMany({
      where: { role: 'DRIVER' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, phone: true, disabledAt: true, createdAt: true },
    });
    const [active, delivered, cash, ratings] = await Promise.all([
      prisma.delivery.groupBy({ by: ['driverId'], where: { status: { in: ['ASSIGNED', 'PICKED_UP'] } }, _count: { _all: true } }),
      prisma.delivery.groupBy({ by: ['driverId'], where: { status: 'DELIVERED' }, _count: { _all: true } }),
      prisma.delivery.groupBy({
        by: ['driverId'],
        where: { status: 'DELIVERED', cashSettledAt: null, codCollectedCents: { gt: 0 } },
        _sum: { codCollectedCents: true },
      }),
      prisma.delivery.groupBy({ by: ['driverId'], where: { rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    ]);
    const activeBy = new Map(active.map((r) => [r.driverId, r._count._all]));
    const deliveredBy = new Map(delivered.map((r) => [r.driverId, r._count._all]));
    const cashBy = new Map(cash.map((r) => [r.driverId, r._sum.codCollectedCents || 0]));
    const ratingBy = new Map(ratings.map((r) => [r.driverId, r]));
    res.json({
      drivers: drivers.map((d) => ({
        ...d,
        activeDeliveries: activeBy.get(d.id) || 0,
        completedDeliveries: deliveredBy.get(d.id) || 0,
        cashHeldCents: cashBy.get(d.id) || 0,
        avgRating: ratingBy.get(d.id)?._avg.rating ?? null,
        ratingCount: ratingBy.get(d.id)?._count.rating || 0,
      })),
    });
  } catch (err) { next(err); }
});

// Cash reconciliation: the courier hands the COD cash they collected over
// to Yobou; the admin confirms the amount and settles every open job.
router.post('/drivers/:id/settle-cash', async (req, res, next) => {
  try {
    const { amountCents } = z.object({ amountCents: z.number().int().nonnegative() }).parse(req.body || {});
    const open = await prisma.delivery.findMany({
      where: { driverId: req.params.id, status: 'DELIVERED', cashSettledAt: null, codCollectedCents: { gt: 0 } },
      select: { id: true, codCollectedCents: true },
    });
    const heldCents = open.reduce((s, d) => s + d.codCollectedCents, 0);
    if (heldCents === 0) return res.status(400).json({ error: 'NOTHING_TO_SETTLE' });
    // The admin types the amount received so a mismatch is caught at the counter.
    if (amountCents !== heldCents) return res.status(400).json({ error: 'AMOUNT_MISMATCH', heldCents });
    await prisma.delivery.updateMany({
      where: { id: { in: open.map((d) => d.id) } },
      data: { cashSettledAt: new Date(), cashSettledById: req.user.id },
    });
    await audit(req.user.id, {
      action: 'driver.settle_cash',
      entityType: 'user',
      entityId: req.params.id,
      meta: { settledCents: heldCents, deliveries: open.length },
    });
    await notify(req.params.id, {
      kind: 'cash_settled',
      title: 'Cash handed in',
      body: `Yobou received $${(heldCents / 100).toFixed(2)} from you for ${open.length} delivery(ies).`,
      link: '/courier',
    });
    res.json({ settledCents: heldCents, deliveries: open.length });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

const driverCreate = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  phone: z.string().trim().min(5).max(40),
});

router.post('/drivers', async (req, res, next) => {
  try {
    const data = driverCreate.parse(req.body);
    const email = data.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: 'EMAIL_TAKEN' });
    const user = await prisma.user.create({
      data: {
        email,
        name: data.name,
        phone: data.phone,
        role: 'DRIVER',
        passwordHash: await bcrypt.hash(data.password, 12),
      },
      select: { id: true, name: true, email: true, phone: true, disabledAt: true, createdAt: true },
    });
    await audit(req.user.id, { action: 'driver.create', entityType: 'user', entityId: user.id, meta: { email } });
    res.status(201).json({ driver: { ...user, activeDeliveries: 0, completedDeliveries: 0 } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'EMAIL_TAKEN' });
    next(err);
  }
});

// Fleet map: every courier with duty state, last GPS fix and active jobs.
router.get('/fleet', async (_req, res, next) => {
  try {
    res.json({ couriers: await fleet(), staleAfterMs: STALE_MS });
  } catch (err) { next(err); }
});

router.get('/deliveries/queue', async (_req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { AND: [DISPATCHABLE, { OR: [{ delivery: null }, { delivery: { status: 'FAILED' } }] }] },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { ...orderSummary.select, delivery: { select: { id: true, status: true, failReason: true, attempts: true } } },
    });
    res.json({ orders });
  } catch (err) { next(err); }
});

router.get('/deliveries', async (req, res, next) => {
  try {
    const where = {};
    if (DELIVERY_STATUSES.includes(String(req.query.status))) where.status = String(req.query.status);
    if (req.query.driverId) where.driverId = String(req.query.driverId);
    const deliveries = await prisma.delivery.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        driver: { select: { id: true, name: true, phone: true } },
        order: orderSummary,
      },
    });
    res.json({ deliveries });
  } catch (err) { next(err); }
});

const assignBody = z.object({ driverId: z.string().min(1) });

router.post('/orders/:id/assign-driver', async (req, res, next) => {
  try {
    const { driverId } = assignBody.parse(req.body);
    const driver = await prisma.user.findUnique({ where: { id: driverId } });
    if (!driver || driver.role !== 'DRIVER') return res.status(400).json({ error: 'NOT_A_DRIVER' });
    if (driver.disabledAt) return res.status(400).json({ error: 'DRIVER_DISABLED' });

    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { delivery: true } });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    const dispatchable = await prisma.order.count({ where: { AND: [{ id: order.id }, DISPATCHABLE] } });
    // A job that is ASSIGNED but not yet picked up can be handed to another courier.
    const reassignable = order.delivery && order.delivery.status === 'ASSIGNED';
    if (!dispatchable && !reassignable) {
      return res.status(409).json({ error: 'ORDER_NOT_DISPATCHABLE', currentStatus: order.status });
    }
    if (order.delivery?.status === 'PICKED_UP') return res.status(409).json({ error: 'ALREADY_PICKED_UP' });

    const codAmountCents = order.paymentMethod === 'COD' ? order.totalCents : 0;
    const delivery = await prisma.$transaction(async (tx) => {
      const row = await tx.delivery.upsert({
        where: { orderId: order.id },
        create: { orderId: order.id, driverId, codAmountCents, deliveryCode: newDeliveryCode() },
        // Re-assignment keeps the customer's code (they may already have it).
        update: {
          driverId, status: 'ASSIGNED', assignedAt: new Date(), failReason: null, pickedUpAt: null,
          ...(order.delivery?.deliveryCode ? {} : { deliveryCode: newDeliveryCode() }),
        },
      });
      // Paid orders move to PROCESSING once a courier is on it; COD and
      // re-dispatched (SHIPPED) orders keep their status.
      const advance = order.status === 'PAID';
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: advance ? 'PROCESSING' : undefined,
          timeline: {
            create: {
              status: advance ? 'PROCESSING' : order.status,
              actorId: req.user.id,
              actorRole: 'ADMIN',
              note: `Courier assigned: ${driver.name}`,
            },
          },
        },
      });
      return row;
    });

    await notify(driverId, {
      kind: 'delivery_assigned',
      title: 'New delivery assigned',
      body: `Order ${shortId(order.id)} → ${[order.snapshotLine1, order.snapshotCity].filter(Boolean).join(', ')}`,
      link: '/courier',
      meta: { orderId: order.id, deliveryId: delivery.id },
    });
    await audit(req.user.id, {
      action: 'delivery.assign',
      entityType: 'order',
      entityId: order.id,
      meta: { driverId, previousDriverId: order.delivery?.driverId || null },
    });
    res.json({ delivery });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;
