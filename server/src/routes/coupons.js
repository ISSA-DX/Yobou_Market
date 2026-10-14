/**
 * Promo codes. Mounted at /api/coupons.
 *
 *   POST  /preview     (any signed-in shopper) { code } → discount on the
 *                      currently selected cart, or a COUPON_* error
 *   GET   /            admin: all codes with usage
 *   POST  /            admin: create
 *   PATCH /:id         admin: edit / activate / deactivate
 *
 * Codes are never deleted once used (orders reference them); deactivate
 * instead. Rules live in lib/coupons.js.
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole } = require('../auth/middleware');
const { audit } = require('../lib/notifications');
const { evaluateCoupon, normalizeCode, CouponError } = require('../lib/coupons');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();
// Stops brute-forcing codes from the checkout box.
const previewLimiter = rateLimit({ name: 'coupon-preview', windowMs: 10 * 60 * 1000, max: 30 });

router.post('/preview', requireAuth, previewLimiter, async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string().trim().min(1).max(40) }).parse(req.body || {});
    const items = await prisma.cartItem.findMany({
      where: { userId: req.user.id, selectedForCheckout: true },
      include: { product: { select: { priceCents: true } } },
    });
    const subtotalCents = items.reduce((s, i) => s + i.product.priceCents * i.quantity, 0);
    const { coupon, discountCents } = await evaluateCoupon(prisma, { code, userId: req.user.id, subtotalCents });
    res.json({
      code: coupon.code,
      description: coupon.description,
      kind: coupon.kind,
      value: coupon.value,
      subtotalCents,
      discountCents,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err instanceof CouponError) return res.status(400).json({ error: err.code, ...err.extra });
    next(err);
  }
});

const couponFields = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only'),
  description: z.string().trim().max(200).nullable().optional(),
  kind: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().positive(),
  minSubtotalCents: z.number().int().nonnegative().default(0),
  maxDiscountCents: z.number().int().positive().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().max(100).default(1),
  isActive: z.boolean().default(true),
});

function toData(d) {
  const out = { ...d };
  if (d.code !== undefined) out.code = normalizeCode(d.code);
  if (d.startsAt !== undefined) out.startsAt = d.startsAt ? new Date(d.startsAt) : null;
  if (d.endsAt !== undefined) out.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  return out;
}

function checkRules(d) {
  if (d.kind === 'PERCENT' && d.value > 100) return 'A percentage can be at most 100.';
  if (d.startsAt && d.endsAt && new Date(d.endsAt) <= new Date(d.startsAt)) return 'The end date must be after the start date.';
  return null;
}

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (_req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    const sums = await prisma.couponRedemption.groupBy({ by: ['couponId'], _sum: { discountCents: true } });
    const given = new Map(sums.map((s) => [s.couponId, s._sum.discountCents || 0]));
    res.json({ coupons: coupons.map((c) => ({ ...c, discountGivenCents: given.get(c.id) || 0 })) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const d = couponFields.parse(req.body);
    const rule = checkRules(d);
    if (rule) return res.status(400).json({ error: 'INVALID_INPUT', message: rule });
    const coupon = await prisma.coupon.create({ data: toData(d) });
    await audit(req.user.id, { action: 'coupon.create', entityType: 'coupon', entityId: coupon.id, meta: { code: coupon.code } });
    res.status(201).json({ coupon });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'CODE_TAKEN' });
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const d = couponFields.partial().parse(req.body);
    const before = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    // The code itself is frozen once used — receipts and orders print it.
    if (d.code && normalizeCode(d.code) !== before.code && before.usedCount > 0) {
      return res.status(400).json({ error: 'CODE_IN_USE' });
    }
    const rule = checkRules({ ...before, ...d, startsAt: d.startsAt ?? before.startsAt?.toISOString(), endsAt: d.endsAt ?? before.endsAt?.toISOString() });
    if (rule) return res.status(400).json({ error: 'INVALID_INPUT', message: rule });
    const coupon = await prisma.coupon.update({ where: { id: before.id }, data: toData(d) });
    await audit(req.user.id, { action: 'coupon.update', entityType: 'coupon', entityId: coupon.id, meta: { code: coupon.code, changes: Object.keys(d) } });
    res.json({ coupon });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'CODE_TAKEN' });
    next(err);
  }
});

module.exports = router;
