/**
 * Vendor analytics — aggregated revenue + KPIs scoped to a single vendor.
 *
 *   GET /api/vendor/analytics?days=14
 *
 * Auth: requireApprovedVendor. `days` is clamped to [1, 90].
 *
 * Response shape:
 *   {
 *     kpis: { products, live, pendingChanges, todayOrders, openOrders,
 *             monthRevenueCents, weekRevenueCents, conversionRate },
 *     revenueByDay: [{ date: 'YYYY-MM-DD', cents, orders }],
 *     topProducts: [{ productId, name, imageUrls, unitsSold, revenueCents }]   // top 10
 *   }
 *
 * Revenue is summed per the vendor's own line items only
 * (OrderItem.priceCents * OrderItem.quantity filtered by product.vendorId).
 * Cancelled and refunded orders are excluded so the number reflects cash
 * actually flowing into the vendor's pocket.
 */
const express = require('express');
const { prisma } = require('../prisma');
const { requireAuth, requireApprovedVendor } = require('../auth/middleware');

const router = express.Router();
router.use(requireAuth, requireApprovedVendor);

const REVENUE_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function parseImages(p) {
  if (!p || typeof p.imageUrls !== 'string') return p;
  try { return { ...p, imageUrls: JSON.parse(p.imageUrls) }; } catch { return { ...p, imageUrls: [] }; }
}

router.get('/analytics', async (req, res, next) => {
  try {
    const vendorId = req.user.vendor.id;
    // `days` is optional — missing → 14. Explicit numeric values get clamped to [1, 90].
    let days = 14;
    if (req.query.days !== undefined) {
      const raw = Number(req.query.days);
      if (Number.isFinite(raw) && raw > 0) days = raw;
    }
    days = Math.max(1, Math.min(90, days));

    // Window boundaries.
    const todayStart = startOfTodayUtc();
    const windowStart = new Date(todayStart);
    windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1));
    const monthStart = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1));
    const weekStart = new Date(todayStart);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);

    // -- KPIs -----------------------------------------------------------------
    const [products, live, pendingChanges, todayOrders, openOrders] = await Promise.all([
      prisma.product.count({ where: { vendorId } }),
      prisma.product.count({ where: { vendorId, status: 'LIVE' } }),
      prisma.productChange.count({ where: { vendorId, status: 'PENDING' } }),
      prisma.order.count({
        where: {
          createdAt: { gte: todayStart },
          items: { some: { product: { vendorId } } },
        },
      }),
      prisma.order.count({
        where: {
          status: { in: ['PAID', 'PROCESSING', 'SHIPPED'] },
          items: { some: { product: { vendorId } } },
        },
      }),
    ]);

    // -- Revenue + orders in window -------------------------------------------
    const ordersInWindow = await prisma.order.findMany({
      where: {
        createdAt: { gte: windowStart },
        status: { in: REVENUE_STATUSES },
        items: { some: { product: { vendorId } } },
      },
      include: { items: { include: { product: true } } },
    });

    const revenueByDayMap = new Map();
    // Pre-seed every day in the window so the chart doesn't have gaps.
    for (let i = 0; i < days; i++) {
      const d = new Date(windowStart);
      d.setUTCDate(windowStart.getUTCDate() + i);
      revenueByDayMap.set(dayKey(d), { date: dayKey(d), cents: 0, orders: 0 });
    }

    let monthCents = 0;
    let weekCents = 0;
    const perProduct = new Map(); // productId -> { unitsSold, revenueCents }

    for (const order of ordersInWindow) {
      const orderDate = dayKey(order.createdAt);
      const slot = revenueByDayMap.get(orderDate);
      if (slot) slot.orders += 1;

      for (const item of order.items) {
        if (item.product.vendorId !== vendorId) continue; // only own line items
        const lineCents = (item.priceCents || 0) * (item.quantity || 0);
        if (slot) slot.cents += lineCents;
        if (order.createdAt >= monthStart) monthCents += lineCents;
        if (order.createdAt >= weekStart) weekCents += lineCents;

        const prev = perProduct.get(item.productId) || { unitsSold: 0, revenueCents: 0 };
        prev.unitsSold += item.quantity || 0;
        prev.revenueCents += lineCents;
        perProduct.set(item.productId, prev);
      }
    }

    // -- Top products (top 10 by revenue) -------------------------------------
    const topEntries = [...perProduct.entries()]
      .sort((a, b) => b[1].revenueCents - a[1].revenueCents)
      .slice(0, 10);
    const topIds = topEntries.map(([id]) => id);
    const topProductsRaw = topIds.length
      ? await prisma.product.findMany({
          where: { id: { in: topIds } },
          select: { id: true, name: true, imageUrls: true },
        })
      : [];
    const topById = new Map(topProductsRaw.map((p) => [p.id, p]));
    const topProducts = topEntries.map(([id, agg]) => {
      const p = topById.get(id);
      return {
        productId: id,
        name: p?.name || 'Product',
        imageUrls: p ? parseImages(p).imageUrls : [],
        unitsSold: agg.unitsSold,
        revenueCents: agg.revenueCents,
      };
    });

    // -- Conversion: paid orders / orders containing any of the vendor's products.
    //    Cheap proxy: orders-in-window / orders-that-contained-product-ever.
    //    For pilot, we report orders-in-window / orders-that-ever-appeared so the
    //    number is meaningful and bounded. Real conversion requires visitor data.
    const [paidOrdersCount, allOrdersEver] = await Promise.all([
      prisma.order.count({
        where: {
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: windowStart },
          items: { some: { product: { vendorId } } },
        },
      }),
      prisma.order.count({
        where: {
          createdAt: { gte: windowStart },
          items: { some: { product: { vendorId } } },
        },
      }),
    ]);
    const conversionRate = allOrdersEver > 0
      ? Number(((paidOrdersCount / allOrdersEver) * 100).toFixed(1))
      : 0;

    res.json({
      kpis: {
        products,
        live,
        pendingChanges,
        todayOrders,
        openOrders,
        monthRevenueCents: monthCents,
        weekRevenueCents: weekCents,
        conversionRate,
      },
      revenueByDay: [...revenueByDayMap.values()],
      topProducts,
    });
  } catch (err) { next(err); }
});

module.exports = router;