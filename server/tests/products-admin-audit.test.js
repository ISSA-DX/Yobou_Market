// Tests that admin direct product writes (POST /api/products/admin,
// PATCH /api/products/:id admin branch, DELETE /api/products/:id admin
// branch) each emit an adminAuditLog row.
//
// This regression coverage was missing before — direct admin writes
// bypassed the audit log entirely while vendor-submitted changes via
// /api/product-changes/:id/approve went through it. Now both paths do.
const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role, extras = {}) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: 'x',
      role,
      ...extras,
    },
  });
}

test('admin product create — writes product.create audit row', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'Yobou Direct Hat',
      description: 'd',
      priceCents: 4999,
      category: 'Apparel',
      imageUrls: [],
      stock: 5,
      status: 'LIVE',
    },
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'product.create', entityId: res.body.product.id },
  });
  assert.ok(audit, 'expected product.create audit row');
  assert.strictEqual(audit.actorId, admin.id);
  assert.match(audit.meta, /Yobou Direct Hat/);
});

test('admin product update — writes product.update audit row', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: { name: 'A', description: 'd', priceCents: 100, category: 'C', imageUrls: [], stock: 1 },
  });
  const id = create.body.product.id;

  const update = await request(app, 'PATCH', `/api/products/${id}`, {
    token,
    body: { priceCents: 200 },
  });
  assert.strictEqual(update.status, 200, JSON.stringify(update.body));

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'product.update', entityId: id },
  });
  assert.ok(audit, 'expected product.update audit row');
  assert.strictEqual(audit.actorId, admin.id);
});

test('admin product delete — writes product.delete audit row', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: { name: 'DeleteMe', description: 'd', priceCents: 100, category: 'C', imageUrls: [], stock: 1 },
  });
  const id = create.body.product.id;

  const del = await request(app, 'DELETE', `/api/products/${id}`, { token });
  assert.strictEqual(del.status, 200, JSON.stringify(del.body));

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'product.delete', entityId: id },
  });
  assert.ok(audit, 'expected product.delete audit row');
  assert.strictEqual(audit.actorId, admin.id);
});

test('admin product delete — 409 with no audit when product has orders', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const customer = await makeUser('CUSTOMER');
  const token = signAccessFor(admin);

  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: { name: 'HasOrders', description: 'd', priceCents: 100, category: 'C', imageUrls: [], stock: 1 },
  });
  const productId = create.body.product.id;

  // Create an order item referencing it directly (no need to go through
  // the full checkout flow — the delete path only checks for an
  // existing OrderItem).
  const addr = await prisma.address.create({
    data: { userId: customer.id, line1: '1 St', city: 'C', state: 'S', postal: 'P' },
  });
  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      addressId: addr.id,
      totalCents: 100,
      paymentMethod: 'CARD',
      status: 'PLACED',
      items: { create: [{ productId, quantity: 1, priceCents: 100 }] },
    },
  });
  assert.ok(order.id);

  const del = await request(app, 'DELETE', `/api/products/${productId}`, { token });
  assert.strictEqual(del.status, 409);
  assert.strictEqual(del.body.error, 'PRODUCT_HAS_ORDERS');

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'product.delete', entityId: productId },
  });
  assert.strictEqual(audit, null, 'no audit row should be written when delete is refused');
});

test('admin /api/admin/products — lists products for admin', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  await request(app, 'POST', '/api/products/admin', {
    token,
    body: { name: 'Listed', description: 'd', priceCents: 1, category: 'C', imageUrls: [], stock: 1 },
  });

  const res = await request(app, 'GET', '/api/admin/products', { token });
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.products));
  assert.ok(res.body.products.length >= 1);
});

test('admin-only routes — vendor POST /api/products/admin returns 403', async () => {
  await resetTestDb();
  const app = getApp();
  const vendorUser = await makeUser('VENDOR', {
    vendor: { create: { businessName: 'V', phone: '555', status: 'APPROVED' } },
  });
  const token = signAccessFor(vendorUser);

  const res = await request(app, 'POST', '/api/products/admin', {
    token,
    body: { name: 'X', description: 'd', priceCents: 1, category: 'C', imageUrls: [], stock: 1 },
  });
  assert.strictEqual(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
});