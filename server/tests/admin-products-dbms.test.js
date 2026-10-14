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

async function seed() {
  const admin = await makeUser('ADMIN');
  const vendor = await makeUser('VENDOR', { vendor: { create: { businessName: 'Acme', phone: '1', status: 'APPROVED' } } });
  const mk = (name, extra = {}) => prisma.product.create({
    data: { name, description: '', priceCents: 1000, category: 'Home', imageUrls: '[]', stock: 3, status: 'LIVE', ...extra },
  });
  const direct = await mk('Direct Lamp');
  const owned = await mk('Acme Chair', { vendorId: vendor.vendor.id, compareAtPriceCents: 1100 });
  return { admin, vendor, direct, owned, token: signAccessFor(admin) };
}

test('admin products — filters by vendor, "direct", status and low stock', async () => {
  await resetTestDb();
  const app = getApp();
  const { vendor, token } = await seed();
  const byVendor = await request(app, 'GET', `/api/admin/products?vendor=${vendor.vendor.id}`, { token });
  assert.deepStrictEqual(byVendor.body.products.map((p) => p.name), ['Acme Chair']);
  const direct = await request(app, 'GET', '/api/admin/products?vendor=direct', { token });
  assert.deepStrictEqual(direct.body.products.map((p) => p.name), ['Direct Lamp']);
  const low = await request(app, 'GET', '/api/admin/products?stock=low', { token });
  assert.strictEqual(low.body.products.length, 2);
});

test('admin products bulk — status, price adjust (drops stale deal), reassign owner', async () => {
  await resetTestDb();
  const app = getApp();
  const { vendor, direct, owned, token } = await seed();

  const hide = await request(app, 'POST', '/api/admin/products/bulk', { token, body: { action: 'setStatus', ids: [direct.id, owned.id], value: 'HIDDEN' } });
  assert.strictEqual(hide.status, 200, JSON.stringify(hide.body));
  assert.strictEqual(hide.body.updated, 2);

  const price = await request(app, 'POST', '/api/admin/products/bulk', { token, body: { action: 'adjustPrice', ids: [owned.id], value: 20 } });
  assert.strictEqual(price.body.updated, 1);
  const after = await prisma.product.findUnique({ where: { id: owned.id } });
  assert.strictEqual(after.priceCents, 1200);
  assert.strictEqual(after.compareAtPriceCents, null);

  const move = await request(app, 'POST', '/api/admin/products/bulk', { token, body: { action: 'assignVendor', ids: [direct.id], value: vendor.vendor.id } });
  assert.strictEqual(move.body.updated, 1);
  assert.strictEqual((await prisma.product.findUnique({ where: { id: direct.id } })).vendorId, vendor.vendor.id);

  assert.ok(await prisma.adminAuditLog.findFirst({ where: { action: 'product.bulk' } }));
});

test('admin products bulk — delete hides products that have order history', async () => {
  await resetTestDb();
  const app = getApp();
  const { direct, owned, token } = await seed();
  const customer = await makeUser('CUSTOMER');
  const addr = await prisma.address.create({ data: { userId: customer.id, line1: 'x', city: 'x', state: 'x', postal: 'x' } });
  await prisma.order.create({
    data: { userId: customer.id, addressId: addr.id, totalCents: 1000, paymentMethod: 'CARD', items: { create: [{ productId: owned.id, quantity: 1, priceCents: 1000 }] } },
  });
  const res = await request(app, 'POST', '/api/admin/products/bulk', { token, body: { action: 'delete', ids: [direct.id, owned.id] } });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.deleted, 1);
  assert.strictEqual(res.body.hidden, 1);
  assert.strictEqual(await prisma.product.findUnique({ where: { id: direct.id } }), null);
  assert.strictEqual((await prisma.product.findUnique({ where: { id: owned.id } })).status, 'HIDDEN');
});

test('admin products — vendors cannot use the admin toolbox', async () => {
  await resetTestDb();
  const app = getApp();
  const { vendor, owned } = await seed();
  const res = await request(app, 'POST', '/api/admin/products/bulk', { token: signAccessFor(vendor), body: { action: 'delete', ids: [owned.id] } });
  assert.strictEqual(res.status, 403);
});

test('admin products — CSV export then import round-trip creates and updates', async () => {
  await resetTestDb();
  const app = getApp();
  const { direct, token } = await seed();

  const csv = await request(app, 'GET', '/api/admin/products/export', { token });
  assert.strictEqual(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);

  const imp = await request(app, 'POST', '/api/admin/products/import', {
    token,
    body: { rows: [
      { id: direct.id, priceCents: '1500', stock: '9' },
      { name: 'New Kettle', category: 'Kitchen', priceCents: '2500', stock: '4', status: 'live', imageUrls: 'a.jpg|b.jpg' },
      { name: 'Broken', category: 'Kitchen' },
      { id: 'does-not-exist', name: 'x' },
    ] },
  });
  assert.strictEqual(imp.status, 200, JSON.stringify(imp.body));
  assert.strictEqual(imp.body.updated, 1);
  assert.strictEqual(imp.body.created, 1);
  assert.strictEqual(imp.body.errors.length, 2);
  assert.deepStrictEqual(imp.body.errors.map((e) => e.line), [4, 5]);

  const updated = await prisma.product.findUnique({ where: { id: direct.id } });
  assert.strictEqual(updated.priceCents, 1500);
  assert.strictEqual(updated.stock, 9);
  const kettle = await prisma.product.findFirst({ where: { name: 'New Kettle' } });
  assert.strictEqual(kettle.status, 'LIVE');
  assert.deepStrictEqual(JSON.parse(kettle.imageUrls), ['a.jpg', 'b.jpg']);
});
