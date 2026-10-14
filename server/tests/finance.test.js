const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role, extras = {}) {
  const bcrypt = require('bcrypt');
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: await bcrypt.hash('Password123!', 4),
      role,
      ...extras,
    },
    include: { vendor: true },
  });
}

// Mixed order: Store A sells 2 × $10, Store B 1 × $30, Yobou Direct 1 × $5.
async function seed({ paymentMethod = 'CARD', status = 'PAID' } = {}) {
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const driver = await makeUser('DRIVER');
  const customer = await makeUser('CUSTOMER');
  const a = await makeUser('VENDOR', { vendor: { create: { businessName: 'A', phone: '1', status: 'APPROVED', commissionBps: 1000 } } });
  const b = await makeUser('VENDOR', { vendor: { create: { businessName: 'B', phone: '2', status: 'APPROVED', commissionBps: 2000 } } });
  const addr = await prisma.address.create({ data: { userId: customer.id, line1: 'x', city: 'x', state: 'x', postal: 'x' } });
  const mk = (vendorId, priceCents) => prisma.product.create({
    data: { name: 'P', description: '', priceCents, category: 'C', imageUrls: '[]', stock: 9, vendorId },
  });
  const [pa, pb, pd] = [await mk(a.vendor.id, 1000), await mk(b.vendor.id, 3000), await mk(null, 500)];
  const order = await prisma.order.create({
    data: {
      userId: customer.id, addressId: addr.id, subtotalCents: 5500, totalCents: 5500, paymentMethod, status,
      items: { create: [
        { productId: pa.id, quantity: 2, priceCents: 1000 },
        { productId: pb.id, quantity: 1, priceCents: 3000 },
        { productId: pd.id, quantity: 1, priceCents: 500 },
      ] },
    },
  });
  return { app, admin, driver, customer, a, b, order, adminT: signAccessFor(admin) };
}

async function deliverByCourier(s, extra = {}) {
  await request(s.app, 'POST', `/api/admin/orders/${s.order.id}/assign-driver`, { token: s.adminT, body: { driverId: s.driver.id } });
  const d = await prisma.delivery.findUnique({ where: { orderId: s.order.id } });
  const t = signAccessFor(s.driver);
  await request(s.app, 'POST', `/api/driver/deliveries/${d.id}/pickup`, { token: t });
  const r = await request(s.app, 'POST', `/api/driver/deliveries/${d.id}/deliver`, { token: t, body: { code: d.deliveryCode, ...extra } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  return d;
}

const finance = (s, vendorUser) => request(s.app, 'GET', '/api/vendor/finance', { token: signAccessFor(vendorUser) });

test('ledger — delivery credits each store its share minus its own commission (idempotent)', async () => {
  await resetTestDb();
  const s = await seed();
  await deliverByCourier(s);

  const fa = await finance(s, s.a);
  assert.strictEqual(fa.status, 200, JSON.stringify(fa.body));
  assert.strictEqual(fa.body.balanceCents, 1800); // 2000 − 10%
  assert.strictEqual(fa.body.lifetime.commissionCents, 200);
  const fb = await finance(s, s.b);
  assert.strictEqual(fb.body.balanceCents, 2400); // 3000 − 20%
  // Yobou Direct items never create ledger rows.
  assert.strictEqual(await prisma.vendorLedger.count(), 2);

  const admin = await request(s.app, 'GET', '/api/admin/finance', { token: s.adminT });
  assert.strictEqual(admin.body.totals.commissionEarnedCents, 800);
  assert.strictEqual(admin.body.totals.directSalesCents, 500);
  assert.strictEqual(admin.body.totals.owedToStoresCents, 4200);

  // Re-running the hook does not double-credit.
  const { recordEarnings } = require('../src/lib/ledger');
  await recordEarnings(prisma, s.order.id);
  assert.strictEqual(await prisma.vendorLedger.count(), 2);
});

test('ledger — boot backfill credits orders delivered before the ledger existed, once', async () => {
  await resetTestDb();
  const s = await seed({ status: 'DELIVERED' });
  const { backfillLedger } = require('../src/lib/ledger');
  assert.strictEqual(await backfillLedger(prisma), 1);
  assert.strictEqual((await finance(s, s.a)).body.balanceCents, 1800);
  assert.strictEqual(await backfillLedger(prisma), 0);
});

test('ledger — pending earnings show before delivery; refund reverses earnings and commission', async () => {
  await resetTestDb();
  const s = await seed();
  assert.strictEqual((await finance(s, s.a)).body.pendingCents, 1800);
  await deliverByCourier(s);
  assert.strictEqual((await finance(s, s.a)).body.pendingCents, 0);

  const refund = await prisma.refund.create({ data: { orderId: s.order.id, requestedById: s.customer.id, reason: 'Broken', amountCents: 5500 } });
  const r = await request(s.app, 'POST', `/api/refunds/${refund.id}/approve`, { token: s.adminT, body: {} });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual((await finance(s, s.a)).body.balanceCents, 0);
  assert.strictEqual((await finance(s, s.b)).body.balanceCents, 0);
  const admin = await request(s.app, 'GET', '/api/admin/finance', { token: s.adminT });
  assert.strictEqual(admin.body.totals.commissionEarnedCents, 0);
});

test('payouts — request reserves funds; reject returns them; pay records the reference', async () => {
  await resetTestDb();
  const s = await seed();
  await deliverByCourier(s);
  const t = signAccessFor(s.a);

  const tooMuch = await request(s.app, 'POST', '/api/vendor/payouts', { token: t, body: { amountCents: 5000, method: 'Bank transfer' } });
  assert.strictEqual(tooMuch.body.error, 'INSUFFICIENT_BALANCE');
  const tooSmall = await request(s.app, 'POST', '/api/vendor/payouts', { token: t, body: { amountCents: 50, method: 'Bank transfer' } });
  assert.strictEqual(tooSmall.body.error, 'BELOW_MINIMUM');

  const p1 = await request(s.app, 'POST', '/api/vendor/payouts', { token: t, body: { amountCents: 1800, method: 'Orange Money' } });
  assert.strictEqual(p1.status, 201, JSON.stringify(p1.body));
  assert.strictEqual((await finance(s, s.a)).body.balanceCents, 0);

  const rej = await request(s.app, 'POST', `/api/admin/payouts/${p1.body.payout.id}/reject`, { token: s.adminT, body: { adminNote: 'Wrong number' } });
  assert.strictEqual(rej.body.payout.status, 'REJECTED');
  assert.strictEqual((await finance(s, s.a)).body.balanceCents, 1800);

  const p2 = await request(s.app, 'POST', '/api/vendor/payouts', { token: t, body: { amountCents: 1000, method: 'Bank transfer' } });
  const paid = await request(s.app, 'POST', `/api/admin/payouts/${p2.body.payout.id}/pay`, { token: s.adminT, body: { reference: 'TX-123' } });
  assert.strictEqual(paid.body.payout.status, 'PAID');
  assert.strictEqual(paid.body.payout.reference, 'TX-123');
  assert.strictEqual((await finance(s, s.a)).body.balanceCents, 800);
  const again = await request(s.app, 'POST', `/api/admin/payouts/${p2.body.payout.id}/pay`, { token: s.adminT, body: { reference: 'TX-123' } });
  assert.strictEqual(again.status, 409);

  // Vendors cannot reach the admin finance endpoints.
  assert.strictEqual((await request(s.app, 'GET', '/api/admin/finance', { token: t })).status, 403);
});

test('commission — admin changes a store rate; applies to later deliveries', async () => {
  await resetTestDb();
  const s = await seed();
  const r = await request(s.app, 'PATCH', `/api/admin/vendors/${s.a.vendor.id}/commission`, { token: s.adminT, body: { commissionBps: 500 } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  await deliverByCourier(s);
  assert.strictEqual((await finance(s, s.a)).body.balanceCents, 1900);
  const bad = await request(s.app, 'PATCH', `/api/admin/vendors/${s.a.vendor.id}/commission`, { token: s.adminT, body: { commissionBps: 9000 } });
  assert.strictEqual(bad.status, 400);
});

test('courier cash — COD cash is held by the courier until an admin settles the exact amount', async () => {
  await resetTestDb();
  const s = await seed({ paymentMethod: 'COD', status: 'PLACED' });
  await deliverByCourier(s, { codCollectedCents: 5500 });

  let drivers = await request(s.app, 'GET', '/api/admin/drivers', { token: s.adminT });
  assert.strictEqual(drivers.body.drivers[0].cashHeldCents, 5500);
  const mine = await request(s.app, 'GET', '/api/driver/deliveries?scope=done', { token: signAccessFor(s.driver) });
  assert.strictEqual(mine.body.stats.cashToHandInCents, 5500);

  const wrong = await request(s.app, 'POST', `/api/admin/drivers/${s.driver.id}/settle-cash`, { token: s.adminT, body: { amountCents: 5000 } });
  assert.strictEqual(wrong.body.error, 'AMOUNT_MISMATCH');
  const ok = await request(s.app, 'POST', `/api/admin/drivers/${s.driver.id}/settle-cash`, { token: s.adminT, body: { amountCents: 5500 } });
  assert.strictEqual(ok.body.settledCents, 5500);
  drivers = await request(s.app, 'GET', '/api/admin/drivers', { token: s.adminT });
  assert.strictEqual(drivers.body.drivers[0].cashHeldCents, 0);
});

test('delivery code + rating — customer sees the code, vendor never; customer rates once', async () => {
  await resetTestDb();
  const s = await seed();
  await request(s.app, 'POST', `/api/admin/orders/${s.order.id}/assign-driver`, { token: s.adminT, body: { driverId: s.driver.id } });
  const d = await prisma.delivery.findUnique({ where: { orderId: s.order.id } });
  const c = await request(s.app, 'GET', `/api/orders/${s.order.id}/tracking`, { token: signAccessFor(s.customer) });
  assert.strictEqual(c.body.tracking.deliveryCode, d.deliveryCode);
  const v = await request(s.app, 'GET', `/api/orders/${s.order.id}/tracking`, { token: signAccessFor(s.a) });
  assert.strictEqual(v.body.tracking.deliveryCode, null);

  const early = await request(s.app, 'POST', `/api/orders/${s.order.id}/rate-courier`, { token: signAccessFor(s.customer), body: { rating: 5 } });
  assert.strictEqual(early.body.error, 'NOT_DELIVERED');

  const t = signAccessFor(s.driver);
  await request(s.app, 'POST', `/api/driver/deliveries/${d.id}/pickup`, { token: t });
  await request(s.app, 'POST', `/api/driver/deliveries/${d.id}/deliver`, { token: t, body: { code: d.deliveryCode } });
  const after = await request(s.app, 'GET', `/api/orders/${s.order.id}/tracking`, { token: signAccessFor(s.customer) });
  assert.strictEqual(after.body.tracking.canRate, true);
  assert.strictEqual(after.body.tracking.deliveryCode, null);

  const rate = await request(s.app, 'POST', `/api/orders/${s.order.id}/rate-courier`, { token: signAccessFor(s.customer), body: { rating: 4, comment: 'Fast!' } });
  assert.strictEqual(rate.status, 200, JSON.stringify(rate.body));
  const twice = await request(s.app, 'POST', `/api/orders/${s.order.id}/rate-courier`, { token: signAccessFor(s.customer), body: { rating: 1 } });
  assert.strictEqual(twice.body.error, 'ALREADY_RATED');
  const drivers = await request(s.app, 'GET', '/api/admin/drivers', { token: s.adminT });
  assert.strictEqual(drivers.body.drivers[0].avgRating, 4);
});
