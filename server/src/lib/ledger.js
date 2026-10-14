/**
 * Store ledger — what Yobou owes each vendor.
 *
 *   order DELIVERED  → EARNING  +(items − commission) per store in the order
 *   order REFUNDED   → REFUND   −(refund share − commission share) per store
 *   payout requested → PAYOUT   −amount (reserved until paid / rejected)
 *   payout rejected  → ADJUSTMENT +amount
 *
 * Balance = SUM(amountCents). Rows are never edited, so the history is an
 * audit trail. recordEarnings/recordRefund are idempotent per (store, order).
 */
const { prisma } = require('../prisma');

function commissionOf(grossCents, bps) {
  return Math.round((grossCents * bps) / 10000);
}

// Per-store gross of an order: { vendorId → { gross, bps } }. Yobou Direct
// items (vendorId = null) are Yobou's own revenue and get no ledger rows.
async function storeShares(db, orderId) {
  const items = await db.orderItem.findMany({
    where: { orderId },
    select: { quantity: true, priceCents: true, product: { select: { vendorId: true, vendor: { select: { commissionBps: true } } } } },
  });
  const shares = new Map();
  for (const i of items) {
    const vendorId = i.product?.vendorId;
    if (!vendorId) continue;
    const s = shares.get(vendorId) || { gross: 0, bps: i.product.vendor?.commissionBps ?? 1000 };
    s.gross += i.priceCents * i.quantity;
    shares.set(vendorId, s);
  }
  return shares;
}

async function recordEarnings(db, orderId) {
  const shares = await storeShares(db, orderId);
  for (const [vendorId, { gross, bps }] of shares) {
    const exists = await db.vendorLedger.findFirst({ where: { vendorId, orderId, kind: 'EARNING' }, select: { id: true } });
    if (exists) continue;
    const commission = commissionOf(gross, bps);
    await db.vendorLedger.create({
      data: {
        vendorId,
        orderId,
        kind: 'EARNING',
        grossCents: gross,
        commissionCents: commission,
        amountCents: gross - commission,
        note: `Order #${orderId.slice(-6).toUpperCase()} delivered`,
      },
    });
  }
}

// Reverse the stores' earnings in proportion to how much of what the
// customer paid for goods is refunded. "Paid for goods" excludes delivery
// and is net of any Yobou-funded promo discount, so a full refund of a
// discounted order still reverses the stores' earnings in full.
async function recordRefund(db, orderId, refundCents) {
  const earnings = await db.vendorLedger.findMany({ where: { orderId, kind: 'EARNING' } });
  if (earnings.length === 0) return;
  const order = await db.order.findUnique({ where: { id: orderId }, select: { totalCents: true, shippingCents: true } });
  const paidForGoods = Math.max(1, order.totalCents - order.shippingCents);
  const ratio = Math.min(1, refundCents / paidForGoods);
  for (const e of earnings) {
    const exists = await db.vendorLedger.findFirst({ where: { vendorId: e.vendorId, orderId, kind: 'REFUND' }, select: { id: true } });
    if (exists) continue;
    const gross = Math.round(e.grossCents * ratio);
    const commission = e.grossCents ? Math.round((e.commissionCents * gross) / e.grossCents) : 0;
    await db.vendorLedger.create({
      data: {
        vendorId: e.vendorId,
        orderId,
        kind: 'REFUND',
        grossCents: -gross,
        commissionCents: -commission,
        amountCents: -(gross - commission),
        note: `Order #${orderId.slice(-6).toUpperCase()} refunded`,
      },
    });
  }
}

async function balanceOf(vendorId, db = prisma) {
  const agg = await db.vendorLedger.aggregate({ where: { vendorId }, _sum: { amountCents: true } });
  return agg._sum.amountCents || 0;
}

// Earnings not yet credited: the store's items in orders that are paid
// (or COD) but not delivered yet. Net of commission.
async function pendingOf(vendor) {
  const items = await prisma.orderItem.findMany({
    where: {
      product: { vendorId: vendor.id },
      order: {
        OR: [
          { status: { in: ['PAID', 'PROCESSING', 'SHIPPED'] } },
          { status: 'PLACED', paymentMethod: 'COD' },
        ],
      },
    },
    select: { quantity: true, priceCents: true },
  });
  const gross = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  return gross - commissionOf(gross, vendor.commissionBps);
}

// Credit any delivered / refunded order that has no ledger rows yet (orders
// completed before the ledger existed). Idempotent; runs on every boot.
async function backfillLedger(db = prisma) {
  const orders = await db.order.findMany({
    where: { status: { in: ['DELIVERED', 'REFUNDED'] }, items: { some: { product: { vendorId: { not: null } } } } },
    select: { id: true, status: true, refunds: { where: { status: 'PROCESSED' }, select: { amountCents: true } } },
  });
  let credited = 0;
  for (const o of orders) {
    const has = await db.vendorLedger.findFirst({ where: { orderId: o.id }, select: { id: true } });
    if (has) continue;
    await recordEarnings(db, o.id);
    const refunded = o.refunds.reduce((s, r) => s + r.amountCents, 0);
    if (o.status === 'REFUNDED' && refunded > 0) await recordRefund(db, o.id, refunded);
    credited += 1;
  }
  return credited;
}

module.exports = { recordEarnings, recordRefund, balanceOf, pendingOf, commissionOf, backfillLedger };
