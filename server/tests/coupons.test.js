const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role = 'CUSTOMER') {
  const bcrypt = require('bcrypt');
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: await bcrypt.hash('Password123!', 4),
      role,
    },
  });
}

// Shopper with $60 of goods selected in the cart (free delivery ≥ $50).
async function seed() {
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const shopper = await makeUser();
  const addr = await prisma.address.create({ data: { userId: shopper.id, line1: 'x', city: 'x', state: 'x', postal: 'x' } });
  const product = await prisma.product.create({
    data: { name: 'Lamp', description: '', priceCents: 3000, category: 'Home', imageUrls: '[]', stock: 20 },
  });
  const fillCart = () => prisma.cartItem.create({ data: { userId: shopper.id, productId: product.id, quantity: 2, selectedForCheckout: true } });
  await fillCart();
  return { app, admin, shopper, addr, product, fillCart, adminT: signAccessFor(admin), shopT: signAccessFor(shopper) };
}

const create = (s, body) => request(s.app, 'POST', '/api/coupons', { token: s.adminT, body });
const preview = (s, code) => request(s.app, 'POST', '/api/coupons/preview', { token: s.shopT, body: { code } });
const order = (s, couponCode) => request(s.app, 'POST', '/api/orders', {
  token: s.shopT, body: { addressId: s.addr.id, paymentMethod: 'COD', ...(couponCode ? { couponCode } : {}) },
});

test('coupons — admin creates; preview + checkout apply a capped percentage discount', async () => {
  await resetTestDb();
  const s = await seed();
  const c = await create(s, { code: 'launch20', kind: 'PERCENT', value: 20, maxDiscountCents: 1000, description: 'Launch' });
  assert.strictEqual(c.status, 201, JSON.stringify(c.body));
  assert.strictEqual(c.body.coupon.code, 'LAUNCH20');

  const p = await preview(s, 'Launch20');
  assert.strictEqual(p.status, 200, JSON.stringify(p.body));
  assert.strictEqual(p.body.discountCents, 1000); // 20% of 6000 = 1200, capped at 1000

  const o = await order(s, 'launch20');
  assert.strictEqual(o.status, 201, JSON.stringify(o.body));
  assert.strictEqual(o.body.order.discountCents, 1000);
  assert.strictEqual(o.body.order.couponCode, 'LAUNCH20');
  assert.strictEqual(o.body.order.totalCents, 5000); // 6000 − 1000 + free delivery
  assert.strictEqual((await prisma.coupon.findUnique({ where: { code: 'LAUNCH20' } })).usedCount, 1);
});

test('coupons — per-customer limit, min subtotal, expiry, inactive and unknown codes are refused', async () => {
  await resetTestDb();
  const s = await seed();
  await create(s, { code: 'ONCE', kind: 'FIXED', value: 500 });
  await create(s, { code: 'BIGBASKET', kind: 'FIXED', value: 500, minSubtotalCents: 10000 });
  await create(s, { code: 'OLD', kind: 'FIXED', value: 500, endsAt: new Date(Date.now() - 1000).toISOString() });
  await create(s, { code: 'OFF', kind: 'FIXED', value: 500, isActive: false });

  assert.strictEqual((await order(s, 'ONCE')).status, 201);
  await s.fillCart();
  assert.strictEqual((await preview(s, 'ONCE')).body.error, 'COUPON_ALREADY_USED');
  const min = await preview(s, 'BIGBASKET');
  assert.strictEqual(min.body.error, 'COUPON_MIN_SUBTOTAL');
  assert.strictEqual(min.body.minSubtotalCents, 10000);
  assert.strictEqual((await preview(s, 'OLD')).body.error, 'COUPON_EXPIRED');
  assert.strictEqual((await preview(s, 'OFF')).body.error, 'COUPON_INACTIVE');
  assert.strictEqual((await preview(s, 'NOPE')).body.error, 'COUPON_NOT_FOUND');
  // A bad code at checkout never creates the order.
  const before = await prisma.order.count();
  assert.strictEqual((await order(s, 'OLD')).body.error, 'COUPON_EXPIRED');
  assert.strictEqual(await prisma.order.count(), before);
});

test('coupons — total use cap and cancellation gives the use back', async () => {
  await resetTestDb();
  const s = await seed();
  await create(s, { code: 'FIRST1', kind: 'FIXED', value: 700, maxUses: 1 });
  const o = await order(s, 'FIRST1');
  assert.strictEqual(o.status, 201, JSON.stringify(o.body));
  const other = await makeUser();
  await prisma.cartItem.create({ data: { userId: other.id, productId: s.product.id, quantity: 1, selectedForCheckout: true } });
  const p = await request(s.app, 'POST', '/api/coupons/preview', { token: signAccessFor(other), body: { code: 'FIRST1' } });
  assert.strictEqual(p.body.error, 'COUPON_USED_UP');

  const cancel = await request(s.app, 'POST', `/api/orders/${o.body.order.id}/cancel`, { token: s.adminT, body: { reason: 'Customer changed mind' } });
  assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.body));
  assert.strictEqual((await prisma.coupon.findUnique({ where: { code: 'FIRST1' } })).usedCount, 0);
  const again = await request(s.app, 'POST', '/api/coupons/preview', { token: signAccessFor(other), body: { code: 'FIRST1' } });
  assert.strictEqual(again.status, 200);
});

test('coupons — validation and admin-only management', async () => {
  await resetTestDb();
  const s = await seed();
  assert.strictEqual((await create(s, { code: 'BAD', kind: 'PERCENT', value: 150 })).status, 400);
  assert.strictEqual((await create(s, { code: 'has space', kind: 'FIXED', value: 100 })).status, 400);
  await create(s, { code: 'DUP', kind: 'FIXED', value: 100 });
  assert.strictEqual((await create(s, { code: 'dup', kind: 'FIXED', value: 100 })).status, 409);
  assert.strictEqual((await request(s.app, 'GET', '/api/coupons', { token: s.shopT })).status, 403);

  const list = await request(s.app, 'GET', '/api/coupons', { token: s.adminT });
  const dup = list.body.coupons.find((c) => c.code === 'DUP');
  const off = await request(s.app, 'PATCH', `/api/coupons/${dup.id}`, { token: s.adminT, body: { isActive: false } });
  assert.strictEqual(off.body.coupon.isActive, false);
});

test('order confirmation email is sent with the discount line', async () => {
  await resetTestDb();
  const s = await seed();
  const { outbox } = require('../src/lib/mailer');
  outbox.length = 0;
  await create(s, { code: 'MAIL5', kind: 'FIXED', value: 500 });
  await order(s, 'MAIL5');
  const mail = outbox.find((m) => m.to === s.shopper.email);
  assert.ok(mail, 'confirmation email sent');
  assert.match(mail.subject, /Order #\w+ confirmed/);
  assert.match(mail.html, /Promo MAIL5/);
});
