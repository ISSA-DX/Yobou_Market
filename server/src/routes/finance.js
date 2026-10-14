/**
 * Marketplace finance — store balances, commission and payouts.
 *
 * Vendor (mounted at /api/vendor):
 *   GET  /finance                 balance, pending earnings, ledger, payouts
 *   POST /payouts                 { amountCents, method } request a payout
 *
 * Admin (mounted at /api/admin):
 *   GET   /finance                per-store balances + platform totals
 *   PATCH /vendors/:id/commission { commissionBps } (0–5000 = 0–50%)
 *   GET   /payouts                ?status=REQUESTED|PAID|REJECTED
 *   POST  /payouts/:id/pay        { reference, adminNote? }
 *   POST  /payouts/:id/reject     { adminNote }
 *
 * The money model lives in lib/ledger.js.
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { notify, notifyMany, audit } = require('../lib/notifications');
const { balanceOf, pendingOf } = require('../lib/ledger');

const MIN_PAYOUT_CENTS = 1000;
const money = (c) => `$${(c / 100).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Vendor
// ---------------------------------------------------------------------------
const vendorRouter = express.Router();
vendorRouter.use('/finance', requireAuth, requireApprovedVendor);
vendorRouter.use('/payouts', requireAuth, requireApprovedVendor);

vendorRouter.get('/finance', async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { id: req.user.vendor.id } });
    const [balanceCents, pendingCents, totals, ledger, payouts] = await Promise.all([
      balanceOf(vendor.id),
      pendingOf(vendor),
      prisma.vendorLedger.aggregate({
        where: { vendorId: vendor.id, kind: { in: ['EARNING', 'REFUND'] } },
        _sum: { grossCents: true, commissionCents: true, amountCents: true },
      }),
      prisma.vendorLedger.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { requestedAt: 'desc' }, take: 50 }),
    ]);
    res.json({
      commissionBps: vendor.commissionBps,
      minPayoutCents: MIN_PAYOUT_CENTS,
      balanceCents,
      pendingCents,
      lifetime: {
        grossCents: totals._sum.grossCents || 0,
        commissionCents: totals._sum.commissionCents || 0,
        netCents: totals._sum.amountCents || 0,
      },
      ledger,
      payouts,
    });
  } catch (err) { next(err); }
});

const payoutRequest = z.object({
  amountCents: z.number().int().positive(),
  method: z.string().trim().min(2).max(80),
});

vendorRouter.post('/payouts', async (req, res, next) => {
  try {
    const data = payoutRequest.parse(req.body);
    const vendorId = req.user.vendor.id;
    if (data.amountCents < MIN_PAYOUT_CENTS) return res.status(400).json({ error: 'BELOW_MINIMUM', minPayoutCents: MIN_PAYOUT_CENTS });
    const payout = await prisma.$transaction(async (tx) => {
      const balance = await balanceOf(vendorId, tx);
      if (data.amountCents > balance) {
        const err = new Error('INSUFFICIENT_BALANCE');
        err.status = 400;
        err.balanceCents = balance;
        throw err;
      }
      const p = await tx.payout.create({ data: { vendorId, amountCents: data.amountCents, method: data.method } });
      await tx.vendorLedger.create({
        data: { vendorId, kind: 'PAYOUT', payoutId: p.id, amountCents: -data.amountCents, note: `Payout requested (${data.method})` },
      });
      return p;
    });
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    await notifyMany(admins.map((a) => a.id), {
      kind: 'payout_requested',
      title: 'Payout requested',
      body: `${req.user.vendor.businessName} requested ${money(data.amountCents)} via ${data.method}.`,
      link: '/finance',
      meta: { payoutId: payout.id, vendorId },
    });
    res.status(201).json({ payout });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'INSUFFICIENT_BALANCE', balanceCents: err.balanceCents });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
const adminRouter = express.Router();
adminRouter.use(['/finance', '/payouts', '/vendors/:id/commission'], requireAuth, requireRole('ADMIN'));

adminRouter.get('/finance', async (_req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: { status: { in: ['APPROVED', 'SUSPENDED'] } },
      orderBy: { businessName: 'asc' },
      select: { id: true, businessName: true, status: true, commissionBps: true },
    });
    const [balances, commission, requested, cod, directSales] = await Promise.all([
      prisma.vendorLedger.groupBy({ by: ['vendorId'], _sum: { amountCents: true } }),
      prisma.vendorLedger.groupBy({ by: ['vendorId'], where: { kind: { in: ['EARNING', 'REFUND'] } }, _sum: { commissionCents: true, grossCents: true } }),
      prisma.payout.groupBy({ by: ['vendorId'], where: { status: 'REQUESTED' }, _sum: { amountCents: true } }),
      prisma.delivery.aggregate({ where: { status: 'DELIVERED', cashSettledAt: null, codCollectedCents: { gt: 0 } }, _sum: { codCollectedCents: true } }),
      prisma.orderItem.findMany({
        where: { product: { vendorId: null }, order: { status: 'DELIVERED' } },
        select: { quantity: true, priceCents: true },
      }),
    ]);
    const by = (rows, f) => new Map(rows.map((r) => [r.vendorId, f(r)]));
    const bal = by(balances, (r) => r._sum.amountCents || 0);
    const com = by(commission, (r) => r._sum);
    const req = by(requested, (r) => r._sum.amountCents || 0);
    const stores = vendors.map((v) => ({
      vendorId: v.id,
      businessName: v.businessName,
      status: v.status,
      commissionBps: v.commissionBps,
      balanceCents: bal.get(v.id) || 0,
      requestedPayoutCents: req.get(v.id) || 0,
      grossSalesCents: com.get(v.id)?.grossCents || 0,
      commissionCents: com.get(v.id)?.commissionCents || 0,
    }));
    res.json({
      stores,
      totals: {
        commissionEarnedCents: stores.reduce((s, x) => s + x.commissionCents, 0),
        directSalesCents: directSales.reduce((s, i) => s + i.priceCents * i.quantity, 0),
        owedToStoresCents: stores.reduce((s, x) => s + x.balanceCents + x.requestedPayoutCents, 0),
        requestedPayoutsCents: stores.reduce((s, x) => s + x.requestedPayoutCents, 0),
        cashWithCouriersCents: cod._sum.codCollectedCents || 0,
      },
    });
  } catch (err) { next(err); }
});

adminRouter.patch('/vendors/:id/commission', async (req, res, next) => {
  try {
    const { commissionBps } = z.object({ commissionBps: z.number().int().min(0).max(5000) }).parse(req.body);
    const before = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    const vendor = await prisma.vendor.update({ where: { id: req.params.id }, data: { commissionBps } });
    await audit(req.user.id, {
      action: 'vendor.commission',
      entityType: 'vendor',
      entityId: vendor.id,
      meta: { from: before.commissionBps, to: commissionBps },
    });
    await notify(vendor.userId, {
      kind: 'vendor_commission',
      title: 'Commission rate updated',
      body: `Your Yobou commission is now ${(commissionBps / 100).toFixed(1)}% on new deliveries.`,
      link: '/payouts',
    });
    res.json({ vendor: { id: vendor.id, commissionBps: vendor.commissionBps } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

adminRouter.get('/payouts', async (req, res, next) => {
  try {
    const where = {};
    if (['REQUESTED', 'PAID', 'REJECTED'].includes(String(req.query.status))) where.status = String(req.query.status);
    const payouts = await prisma.payout.findMany({
      where,
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: { vendor: { select: { id: true, businessName: true } } },
    });
    res.json({ payouts });
  } catch (err) { next(err); }
});

async function review(req, res, next, decision) {
  try {
    const body = decision === 'PAID'
      ? z.object({ reference: z.string().trim().min(2).max(120), adminNote: z.string().trim().max(500).optional() }).parse(req.body || {})
      : z.object({ adminNote: z.string().trim().min(3).max(500) }).parse(req.body || {});
    const p = await prisma.payout.findUnique({ where: { id: req.params.id }, include: { vendor: true } });
    if (!p) return res.status(404).json({ error: 'NOT_FOUND' });
    if (p.status !== 'REQUESTED') return res.status(409).json({ error: 'ALREADY_REVIEWED' });

    const payout = await prisma.$transaction(async (tx) => {
      const updated = await tx.payout.update({
        where: { id: p.id },
        data: { status: decision, reference: body.reference || null, adminNote: body.adminNote || null, reviewedAt: new Date() },
      });
      // A rejected payout releases the reserved funds back to the balance.
      if (decision === 'REJECTED') {
        await tx.vendorLedger.create({
          data: { vendorId: p.vendorId, kind: 'ADJUSTMENT', payoutId: p.id, amountCents: p.amountCents, note: `Payout rejected: ${body.adminNote}` },
        });
      }
      return updated;
    });
    await audit(req.user.id, {
      action: decision === 'PAID' ? 'payout.pay' : 'payout.reject',
      entityType: 'payout',
      entityId: p.id,
      meta: { vendorId: p.vendorId, amountCents: p.amountCents, reference: body.reference, note: body.adminNote },
    });
    await notify(p.vendor.userId, {
      kind: decision === 'PAID' ? 'payout_paid' : 'payout_rejected',
      title: decision === 'PAID' ? 'Payout sent' : 'Payout rejected',
      body: decision === 'PAID'
        ? `${money(p.amountCents)} was sent (ref ${body.reference}).`
        : `${money(p.amountCents)} returned to your balance: ${body.adminNote}`,
      link: '/payouts',
      meta: { payoutId: p.id },
    });
    res.json({ payout });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
}

adminRouter.post('/payouts/:id/pay', (req, res, next) => review(req, res, next, 'PAID'));
adminRouter.post('/payouts/:id/reject', (req, res, next) => review(req, res, next, 'REJECTED'));

module.exports = { vendorRouter, adminRouter };
