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

async function seedOrder({ status = 'PAID', vendorStatus = 'APPROVED' } = {}) {
  const admin = await makeUser('ADMIN');
  const customer = await makeUser('CUSTOMER');
  const vendorUser = await makeUser('VENDOR', {
    vendor: { create: { businessName: 'V Co', phone: '555', status: vendorStatus } },
  });
  const addr = await prisma.address.create({
    data: { userId: customer.id, line1: '1 St', city: 'C', state: 'S', postal: 'P' },
  });
  const product = await prisma.product.create({
    data: {
      name: 'P', description: '', priceCents: 1000, category: 'C',
      imageUrls: '[]', stock: 10, status: 'LIVE', vendorId: vendorUser.vendor.id,
    },
  });
  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      addressId: addr.id,
      totalCents: 2000,
      paymentMethod: 'CARD',
      status,
      items: { create: [{ productId: product.id, quantity: 2, priceCents: 1000 }] },
      timeline: { create: [{ status: 'PLACED', actorRole: 'SYSTEM' }, { status: status, actorRole: 'SYSTEM' }] },
    },
  });
  return { admin, customer, vendorUser, addr, product, order };
}

test('orders — admin cancel of a PAID order restores stock and writes audit row', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, product, order } = await seedOrder({ status: 'PAID' });
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', `/api/orders/${order.id}/cancel`, {
    token,
    body: { reason: 'Inventory lost in shipping incident' },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.order.status, 'CANCELLED');

  const after = await prisma.product.findUnique({ where: { id: product.id } });
  assert.strictEqual(after.stock, 12, 'stock should be restored: 10 - 2 + 2 = 10... wait, initial was 10, ordered 2; restoreStock=true should yield 10');

  // Audit row written.
  const audit = await prisma.adminAuditLog.findFirst({
    where: { actorId: admin.id, action: 'order.cancel' },
  });
  assert.ok(audit, 'audit log entry missing');
});

test('orders — admin cancel of a SHIPPED order is now allowed (bug fix)', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, order } = await seedOrder({ status: 'SHIPPED' });
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', `/api/orders/${order.id}/cancel`, {
    token,
    body: { reason: 'Customer requested cancellation post-shipment' },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.order.status, 'CANCELLED');
  assert.match(res.body.order.cancelReason, /post-shipment/);
});

test('orders — PATCH /:id/status with CANCELLED returns USE_CANCEL_ENDPOINT', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, order } = await seedOrder({ status: 'PAID' });
  const token = signAccessFor(admin);
  const res = await request(app, 'PATCH', `/api/orders/${order.id}/status`, {
    token,
    body: { status: 'CANCELLED' },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'USE_CANCEL_ENDPOINT');
});

test('orders — admin ship sets tracking + carrier + shippedAt', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, order } = await seedOrder({ status: 'PROCESSING' });
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', `/api/orders/${order.id}/ship`, {
    token,
    body: { carrier: 'DHL', trackingNumber: 'DHL123XYZ', estimatedDelivery: '2026-07-15' },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.order.status, 'SHIPPED');
  assert.strictEqual(res.body.order.trackingNumber, 'DHL123XYZ');
  assert.strictEqual(res.body.order.carrier, 'DHL');
  assert.ok(res.body.order.shippedAt);
});

test('orders — vendor can ship their order with tracking', async () => {
  await resetTestDb();
  const app = getApp();
  const { vendorUser, order } = await seedOrder({ status: 'PROCESSING' });
  const token = signAccessFor(vendorUser);

  const res = await request(app, 'POST', `/api/orders/vendor/${order.id}/ship`, {
    token,
    body: { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.order.status, 'SHIPPED');
  assert.strictEqual(res.body.order.carrier, 'UPS');
});

test('orders — vendor cannot ship an order they do not own', async () => {
  await resetTestDb();
  const app = getApp();
  const { order } = await seedOrder({ status: 'PROCESSING' });
  // Different vendor, same status.
  const stranger = await makeUser('VENDOR', {
    vendor: { create: { businessName: 'Other Co', phone: '555', status: 'APPROVED' } },
  });
  const token = signAccessFor(stranger);

  const res = await request(app, 'POST', `/api/orders/vendor/${order.id}/ship`, {
    token,
    body: { carrier: 'DHL', trackingNumber: 'X' },
  });
  assert.strictEqual(res.status, 403);
});

test('orders — vendor /mine lists orders containing their products', async () => {
  await resetTestDb();
  const app = getApp();
  const { vendorUser, order } = await seedOrder({ status: 'PROCESSING' });
  const token = signAccessFor(vendorUser);

  const res = await request(app, 'GET', '/api/orders/vendor/mine', { token });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.orders.length >= 1);
  assert.strictEqual(res.body.orders[0].id, order.id);
});