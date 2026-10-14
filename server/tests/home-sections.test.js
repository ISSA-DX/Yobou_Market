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

const base = { description: '', category: 'Home', imageUrls: [], stock: 5 };

test('sections — defaults: new arrivals ON, recent deals OFF', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const r = await request(app, 'POST', '/api/products/admin', { token: signAccessFor(admin), body: { ...base, name: 'Lamp', priceCents: 1000 } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.product.showOnNewArrivals, true);
  assert.strictEqual(r.body.product.showOnRecentDeals, false);
});

test('sections — admin places products; storefront filters each section', async () => {
  await resetTestDb();
  const app = getApp();
  const t = signAccessFor(await makeUser('ADMIN'));
  await request(app, 'POST', '/api/products/admin', { token: t, body: { ...base, name: 'Deal Kettle', priceCents: 2000, compareAtPriceCents: 3000, showOnRecentDeals: true, showOnNewArrivals: false } });
  await request(app, 'POST', '/api/products/admin', { token: t, body: { ...base, name: 'Fresh Mug', priceCents: 900 } });

  const deals = await request(app, 'GET', '/api/products?showOnRecentDeals=true');
  assert.deepStrictEqual(deals.body.products.map((p) => p.name), ['Deal Kettle']);
  const fresh = await request(app, 'GET', '/api/products?showOnNewArrivals=true');
  assert.deepStrictEqual(fresh.body.products.map((p) => p.name), ['Fresh Mug']);
});

test('sections — seller proposes placements; they apply only after admin approval', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const vendor = await makeUser('VENDOR', { vendor: { create: { businessName: 'Store', phone: '1', status: 'APPROVED' } } });
  const sub = await request(app, 'POST', '/api/products', {
    token: signAccessFor(vendor),
    body: { ...base, name: 'Seller Promo', priceCents: 1500, compareAtPriceCents: 2500, showOnRecentDeals: true, showOnNewArrivals: false },
  });
  assert.strictEqual(sub.status, 201, JSON.stringify(sub.body));
  assert.strictEqual(sub.body.change.proposedShowOnRecentDeals, true);
  assert.strictEqual((await request(app, 'GET', '/api/products?showOnRecentDeals=true')).body.products.length, 0);

  const ok = await request(app, 'POST', `/api/product-changes/${sub.body.change.id}/approve`, { token: signAccessFor(admin), body: {} });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  const live = await prisma.product.findFirst({ where: { name: 'Seller Promo' } });
  assert.strictEqual(live.showOnRecentDeals, true);
  assert.strictEqual(live.showOnNewArrivals, false);

  // A later UPDATE that only touches New arrivals leaves Recent deals alone.
  const upd = await request(app, 'PATCH', `/api/products/${live.id}`, { token: signAccessFor(vendor), body: { showOnNewArrivals: true } });
  assert.strictEqual(upd.status, 202, JSON.stringify(upd.body));
  await request(app, 'POST', `/api/product-changes/${upd.body.change.id}/approve`, { token: signAccessFor(admin), body: {} });
  const after = await prisma.product.findUnique({ where: { id: live.id } });
  assert.strictEqual(after.showOnNewArrivals, true);
  assert.strictEqual(after.showOnRecentDeals, true);
});

test('sections — admin bulk adds/removes products from a section', async () => {
  await resetTestDb();
  const app = getApp();
  const t = signAccessFor(await makeUser('ADMIN'));
  const a = (await request(app, 'POST', '/api/products/admin', { token: t, body: { ...base, name: 'A', priceCents: 100 } })).body.product;
  const b = (await request(app, 'POST', '/api/products/admin', { token: t, body: { ...base, name: 'B', priceCents: 100 } })).body.product;
  const on = await request(app, 'POST', '/api/admin/products/bulk', { token: t, body: { action: 'setPlacement', ids: [a.id, b.id], value: { flag: 'showOnRecentDeals', on: true } } });
  assert.strictEqual(on.status, 200, JSON.stringify(on.body));
  assert.strictEqual(on.body.updated, 2);
  assert.strictEqual((await request(app, 'GET', '/api/products?showOnRecentDeals=true')).body.products.length, 2);
  const bad = await request(app, 'POST', '/api/admin/products/bulk', { token: t, body: { action: 'setPlacement', ids: [a.id], value: { flag: 'priceCents', on: true } } });
  assert.strictEqual(bad.status, 400);
});
