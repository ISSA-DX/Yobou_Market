// Promo code rules, shared by the checkout preview and order creation.
// Discounts are funded by Yobou (store earnings use full item prices).
const normalizeCode = (code) => String(code || '').trim().toUpperCase();

class CouponError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

function discountFor(coupon, subtotalCents) {
  let d = coupon.kind === 'PERCENT'
    ? Math.round((subtotalCents * coupon.value) / 100)
    : coupon.value;
  if (coupon.kind === 'PERCENT' && coupon.maxDiscountCents != null) d = Math.min(d, coupon.maxDiscountCents);
  return Math.max(0, Math.min(d, subtotalCents));
}

// Throws CouponError with one of: COUPON_NOT_FOUND, COUPON_INACTIVE,
// COUPON_NOT_STARTED, COUPON_EXPIRED, COUPON_MIN_SUBTOTAL, COUPON_USED_UP,
// COUPON_ALREADY_USED.
async function evaluateCoupon(db, { code, userId, subtotalCents }) {
  const coupon = await db.coupon.findUnique({ where: { code: normalizeCode(code) } });
  if (!coupon) throw new CouponError('COUPON_NOT_FOUND');
  const now = new Date();
  if (!coupon.isActive) throw new CouponError('COUPON_INACTIVE');
  if (coupon.startsAt && coupon.startsAt > now) throw new CouponError('COUPON_NOT_STARTED');
  if (coupon.endsAt && coupon.endsAt < now) throw new CouponError('COUPON_EXPIRED');
  if (subtotalCents < coupon.minSubtotalCents) {
    throw new CouponError('COUPON_MIN_SUBTOTAL', { minSubtotalCents: coupon.minSubtotalCents });
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) throw new CouponError('COUPON_USED_UP');
  const mine = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } });
  if (mine >= coupon.perUserLimit) throw new CouponError('COUPON_ALREADY_USED');
  return { coupon, discountCents: discountFor(coupon, subtotalCents) };
}

// Inside the order transaction: claim one use atomically (guards the
// last-use race) and record the redemption.
async function redeemCoupon(tx, { coupon, userId, orderId, discountCents }) {
  const where = { id: coupon.id, ...(coupon.maxUses != null ? { usedCount: { lt: coupon.maxUses } } : {}) };
  const claimed = await tx.coupon.updateMany({ where, data: { usedCount: { increment: 1 } } });
  if (claimed.count === 0) throw new CouponError('COUPON_USED_UP');
  await tx.couponRedemption.create({ data: { couponId: coupon.id, userId, orderId, discountCents } });
}

// When an order is cancelled the customer gets their code use back.
async function releaseCoupon(tx, orderId) {
  const r = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (!r) return;
  await tx.couponRedemption.delete({ where: { id: r.id } });
  await tx.coupon.update({ where: { id: r.couponId }, data: { usedCount: { decrement: 1 } } });
}

module.exports = { evaluateCoupon, redeemCoupon, releaseCoupon, discountFor, normalizeCode, CouponError };
