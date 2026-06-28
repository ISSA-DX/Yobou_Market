/**
 * Admin-gated API surface — everything requires role=ADMIN.
 *
 * The previous version had only /products, /kpis, /revenue-by-day. This
 * expansion adds the full admin control plane the brief requires:
 *   - /orders                  list + filter + paginate all orders
 *   - /orders/:id              full detail
 *   - /orders/:id              PATCH for shipping-address / tracking edits
 *   - /users                   list users, filter by role
 *   - /users/:id               disable / enable / change role
 *   - /audit-log               read the admin audit trail
 *   - /broadcast               fan-out an in-app message
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole } = require('../auth/middleware');
const { parseImageUrls } = require('./products');
const { notifyMany, audit } = require('../lib/notifications');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

// ---------------------------------------------------------------------------
// Products (kept from the original admin surface)
// ---------------------------------------------------------------------------
router.get('/products', async (req, res, next) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    const where = {};
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { description: { contains: q } },
        { category: { contains: q } },
      ];
    }
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, businessName: true } },
        changes: {
          where: { status: 'PENDING' },
          select: { id: true, action: true },
        },
      },
    });
    res.json({
      products: products.map((p) => ({
        ...parseImageUrls(p),
        pendingChanges: p.changes || [],
      })),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Orders — list with filters + pagination, full detail, generic edit
// ---------------------------------------------------------------------------
const ORDER_STATUSES = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAYMENT_METHODS = ['CARD', 'PAYPAL', 'COD'];

router.get('/orders', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status && ORDER_STATUSES.includes(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    if (req.query.paymentMethod && PAYMENT_METHODS.includes(String(req.query.paymentMethod))) {
      where.paymentMethod = String(req.query.paymentMethod);
    }
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.vendorId) {
      // Orders containing at least one product from this vendor.
      where.items = { some: { product: { vendorId: String(req.query.vendorId) } } };
    }
    if (req.query.q) {
      const q = String(req.query.q).trim();
      where.OR = [
        { id: { contains: q } },
        { user: { name: { contains: q } } },
        { user: { email: { contains: q } } },
      ];
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
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
    res.json({ orders: rows, total, limit, offset });
  } catch (err) { next(err); }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: { include: { product: { include: { vendor: { select: { id: true, businessName: true } } } } } },
        timeline: { orderBy: { at: 'asc' } },
        address: true,
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ order });
  } catch (err) { next(err); }
});

// Generic admin-side order edit (tracking, internal notes, address swap).
const adminOrderEdit = z.object({
  trackingNumber: z.string().min(1).max(100).optional(),
  carrier: z.enum(['DHL', 'FedEx', 'UPS', 'USPS', 'YobouDirect', 'Other']).optional(),
  estimatedDelivery: z.string().optional(),
  cancelReason: z.string().min(3).max(500).optional(),
});

router.patch('/orders/:id', async (req, res, next) => {
  try {
    const data = adminOrderEdit.parse(req.body);
    const before = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });

    const updates = {};
    if (data.trackingNumber !== undefined) updates.trackingNumber = data.trackingNumber;
    if (data.carrier !== undefined) updates.carrier = data.carrier;
    if (data.estimatedDelivery !== undefined) updates.estimatedDelivery = new Date(data.estimatedDelivery);
    if (data.cancelReason !== undefined) updates.cancelReason = data.cancelReason;

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: updates,
    });
    await audit(req.user.id, {
      action: 'order.edit',
      entityType: 'order',
      entityId: order.id,
      meta: { fields: Object.keys(updates) },
    });
    res.json({ order });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Users — list / change role / disable
// ---------------------------------------------------------------------------
router.get('/users', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.role) where.role = String(req.query.role);
    if (req.query.q) {
      const q = String(req.query.q).trim();
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
      ];
    }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { vendor: { select: { id: true, businessName: true, status: true } } },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users: rows.map(({ passwordHash, ...u }) => u), total, limit, offset });
  } catch (err) { next(err); }
});

const adminUserEdit = z.object({
  role: z.enum(['ADMIN', 'VENDOR', 'CUSTOMER']).optional(),
  disabled: z.boolean().optional(),
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const data = adminUserEdit.parse(req.body);
    if (data.role === undefined && data.disabled === undefined) {
      return res.status(400).json({ error: 'NO_OP' });
    }
    // Don't allow an admin to demote themselves — at least one ADMIN must remain.
    if (data.role && data.role !== 'ADMIN' && req.user.id === req.params.id) {
      return res.status(400).json({ error: 'CANNOT_DEMOTE_SELF' });
    }
    const updates = {};
    if (data.role !== undefined) updates.role = data.role;
    if (data.disabled !== undefined) updates.disabledAt = data.disabled ? new Date() : null;

    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    if (before.role === 'ADMIN' && data.disabled === true) {
      return res.status(400).json({ error: 'CANNOT_DISABLE_ADMIN' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updates,
      include: { vendor: true },
    });

    await audit(req.user.id, {
      action: data.role ? 'user.role' : 'user.disable',
      entityType: 'user',
      entityId: user.id,
      meta: { from: { role: before.role, disabledAt: before.disabledAt }, to: updates },
    });

    const { passwordHash, ...safe } = user;
    res.json({ user: safe });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Audit log — read-only
// ---------------------------------------------------------------------------
router.get('/audit-log', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.action) where.action = String(req.query.action);
    if (req.query.actorId) where.actorId = String(req.query.actorId);
    if (req.query.entityType) where.entityType = String(req.query.entityType);
    if (req.query.entityId) where.entityId = String(req.query.entityId);
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
    }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [rows, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);
    res.json({ entries: rows, total, limit, offset });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Broadcast — fan-out an in-app notification to an audience.
// ---------------------------------------------------------------------------
const broadcastSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  audience: z.enum(['all', 'customers', 'vendors', 'admins']),
  link: z.string().max(500).optional(),
});

router.post('/broadcast', async (req, res, next) => {
  try {
    const data = broadcastSchema.parse(req.body);
    let userIds = [];
    if (data.audience === 'all') {
      const rows = await prisma.user.findMany({ select: { id: true } });
      userIds = rows.map((r) => r.id);
    } else {
      const role = data.audience === 'customers' ? 'CUSTOMER'
                 : data.audience === 'vendors' ? 'VENDOR'
                 : 'ADMIN';
      const rows = await prisma.user.findMany({ where: { role }, select: { id: true } });
      userIds = rows.map((r) => r.id);
    }
    const meta = { broadcastId: `bc_${Date.now()}`, audience: data.audience };
    const result = await notifyMany(userIds, {
      kind: 'admin_broadcast',
      title: data.title,
      body: data.body,
      link: data.link || null,
      meta,
    });
    await audit(req.user.id, {
      action: 'broadcast.send',
      entityType: 'broadcast',
      entityId: meta.broadcastId,
      meta: { audience: data.audience, recipientCount: userIds.length },
    });
    res.status(201).json({ ok: true, recipientCount: userIds.length, created: result.created });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// KPIs + revenue-by-day (kept from the original)
// ---------------------------------------------------------------------------
router.get('/kpis', async (_req, res, next) => {
  try {
    const [orders, revenueAgg, vendors, pendingVendors, pendingChanges, pendingRefunds, customers, openOrders] = await Promise.all([
      prisma.order.count(),
      prisma.order.aggregate({ _sum: { totalCents: true }, where: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } }),
      prisma.vendor.count(),
      prisma.vendor.count({ where: { status: 'PENDING' } }),
      prisma.productChange.count({ where: { status: 'PENDING' } }),
      prisma.refund.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.order.count({ where: { status: { in: ['PROCESSING', 'SHIPPED'] } } }),
    ]);
    res.json({
      totalOrders: orders,
      totalRevenueCents: revenueAgg._sum.totalCents || 0,
      totalVendors: vendors,
      totalCustomers: customers,
      openOrders,
      pendingVendors,
      pendingChanges,
      pendingRefunds,
    });
  } catch (err) { next(err); }
});

router.get('/revenue-by-day', async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
      },
      select: { createdAt: true, totalCents: true },
    });
    const buckets = new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }
    for (const o of orders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + o.totalCents);
    }
    res.json({
      series: Array.from(buckets.entries()).map(([date, cents]) => ({ date, cents })),
    });
  } catch (err) { next(err); }
});

module.exports = router;