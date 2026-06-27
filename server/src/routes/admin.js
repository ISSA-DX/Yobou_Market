const express = require('express');
const { prisma } = require('../prisma');
const { requireAuth, requireRole } = require('../auth/middleware');
const { parseImageUrls } = require('../routes/products');

const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

// Admin product list (all statuses) with optional search.
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

router.get('/kpis', async (_req, res, next) => {
  try {
    const [orders, revenueAgg, vendors, pendingVendors, pendingChanges, pendingRefunds] = await Promise.all([
      prisma.order.count(),
      prisma.order.aggregate({ _sum: { totalCents: true }, where: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } }),
      prisma.vendor.count(),
      prisma.vendor.count({ where: { status: 'PENDING' } }),
      prisma.productChange.count({ where: { status: 'PENDING' } }),
      prisma.refund.count({ where: { status: 'PENDING' } }),
    ]);
    res.json({
      totalOrders: orders,
      totalRevenueCents: revenueAgg._sum.totalCents || 0,
      totalVendors: vendors,
      pendingVendors,
      pendingChanges,
      pendingRefunds,
    });
  } catch (err) { next(err); }
});

router.get('/revenue-by-day', async (_req, res, next) => {
  try {
    // SQLite doesn't have date_trunc; do it in JS.
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