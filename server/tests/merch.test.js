// Category merchandising: campaign banners (admin + partner requests),
// curated collections, stores in a category, store pages and
// department content.
const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role) {
  return prisma.user.create({
    data: { email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@test.local`, name: role, passwordHash: 'x', role },
  });
}

async function makeVendor(name = 'Acme') {
  const user = await makeUser('VENDOR');
  const vendor = await prisma.vendor.create({ data: { userId: user.id, businessName: name, phone: '+15555550100', status: 'APPROVED', description: `${name} sells things.` } });
  return { user, vendor, token: signAccessFor(user) };
}

async function setup() {
  const beauty = await prisma.category.create({ data: { name: 'Beauty', slug: 'beauty' } });
  await prisma.subcategory.create({ data: { categoryId: beauty.id, name: 'Skincare', slug: 'skincare' } });
  const admin = await makeUser('ADMIN');
  return { beauty, adminToken: signAccessFor(admin) };
}

const product = (data) => prisma.product.create({
  data: { description: '', stock: 5, status: 'LIVE', category: 'Beauty', subcategory: 'Skincare', ...data },
});

test('campaigns — admin banner is live only when approved, active and in its dates', async () => {
  await resetTestDb();
  const app = getApp();
  const { adminToken } = await setup();
  const make = (body) => request(app, 'POST', '/api/admin/campaigns', { token: adminToken, body: { category: 'Beauty', linkUrl: '/categories/beauty', ...body } });

  assert.strictEqual((await make({ title: 'Live now' })).status, 201);
  await make({ title: 'Future', startsAt: new Date(Date.now() + 86400000).toISOString() });
  await make({ title: 'Paused', isActive: false });
  await make({ title: 'Over', endsAt: new Date(Date.now() - 86400000).toISOString() });

  const offsite = await make({ title: 'Phish', linkUrl: 'https://evil.example' });
  assert.strictEqual(offsite.status, 400, 'external links are refused');

  const page = await request(app, 'GET', '/api/products/categories/beauty');
  assert.deepStrictEqual(page.body.campaigns.map((c) => c.title), ['Live now']);

  const all = await request(app, 'GET', '/api/admin/campaigns', { token: adminToken });
  assert.deepStrictEqual(all.body.campaigns.map((c) => c.state).sort(), ['ENDED', 'LIVE', 'PAUSED', 'SCHEDULED']);
});

test('campaigns — partner requests stay pending until an admin approves', async () => {
  await resetTestDb();
  const app = getApp();
  const { adminToken } = await setup();
  const { vendor, token } = await makeVendor();
  const other = await makeVendor('Other');
  const mine = await product({ name: 'Serum', priceCents: 1000, vendorId: vendor.id });
  const theirs = await product({ name: 'Cream', priceCents: 1000, vendorId: other.vendor.id });

  const forbidden = await request(app, 'POST', '/api/vendor/campaigns', { token, body: { title: 'Steal', category: 'Beauty', target: 'product', productId: theirs.id } });
  assert.strictEqual(forbidden.status, 403, 'cannot link to another store’s product');

  const req = await request(app, 'POST', '/api/vendor/campaigns', {
    token, body: { title: 'Glow week', category: 'Beauty', subcategory: 'Skincare', target: 'product', productId: mine.id },
  });
  assert.strictEqual(req.status, 201, JSON.stringify(req.body));
  assert.strictEqual(req.body.campaign.status, 'PENDING');
  assert.strictEqual(req.body.campaign.linkUrl, `/product/${mine.id}`);

  let page = await request(app, 'GET', '/api/products/categories/beauty');
  assert.strictEqual(page.body.campaigns.length, 0, 'pending banners are not shown');

  const approve = await request(app, 'PATCH', `/api/admin/campaigns/${req.body.campaign.id}`, { token: adminToken, body: { status: 'APPROVED' } });
  assert.strictEqual(approve.status, 200, JSON.stringify(approve.body));
  page = await request(app, 'GET', '/api/products/categories/beauty');
  assert.deepStrictEqual(page.body.campaigns.map((c) => [c.title, c.subcategory]), [['Glow week', 'Skincare']]);

  const note = await prisma.notification.findFirst({ where: { userId: vendor.userId, kind: 'campaign_reviewed' } });
  assert.ok(note, 'partner is notified of the decision');
});

test('collections — manual keeps order and drops hidden products; rules filter by price and discount', async () => {
  await resetTestDb();
  const app = getApp();
  const { adminToken } = await setup();
  const a = await product({ name: 'A', priceCents: 900, compareAtPriceCents: 1800 });
  const b = await product({ name: 'B', priceCents: 4000 });
  const c = await product({ name: 'C', priceCents: 1500, status: 'HIDDEN' });

  const manual = await request(app, 'POST', '/api/admin/collections', {
    token: adminToken, body: { name: 'Staff picks', category: 'Beauty', mode: 'MANUAL', productIds: [b.id, c.id, a.id] },
  });
  assert.strictEqual(manual.status, 201, JSON.stringify(manual.body));
  assert.strictEqual(manual.body.collection.slug, 'staff-picks');
  assert.deepStrictEqual(manual.body.collection.products.map((p) => p.name), ['B', 'A']);

  await request(app, 'POST', '/api/admin/collections', {
    token: adminToken, body: { name: 'Half price', category: 'Beauty', mode: 'RULE', rule: { minDiscountPct: 40, maxPriceCents: 2000 } },
  });
  const page = await request(app, 'GET', '/api/products/categories/beauty');
  const byName = Object.fromEntries(page.body.collections.map((x) => [x.name, x.products.map((p) => p.name)]));
  assert.deepStrictEqual(byName, { 'Half price': ['A'], 'Staff picks': ['B', 'A'] });

  const pub = await request(app, 'GET', '/api/collections/half-price');
  assert.strictEqual(pub.status, 200);
  assert.deepStrictEqual(pub.body.collection.products.map((p) => p.name), ['A']);
});

test('stores — category lists its stores; store page shows profile and counts', async () => {
  await resetTestDb();
  const app = getApp();
  await setup();
  const { vendor } = await makeVendor('Glow Co');
  await product({ name: 'Serum', priceCents: 1000, compareAtPriceCents: 1500, vendorId: vendor.id });
  await product({ name: 'Toner', priceCents: 800, vendorId: vendor.id });

  const page = await request(app, 'GET', '/api/products/categories/beauty');
  assert.deepStrictEqual(page.body.stores.map((s) => [s.businessName, s.productCount, s.dealCount]), [['Glow Co', 2, 1]]);

  const store = await request(app, 'GET', `/api/stores/${vendor.id}`);
  assert.strictEqual(store.status, 200);
  assert.strictEqual(store.body.store.description, 'Glow Co sells things.');
  assert.deepStrictEqual(store.body.store.categories, [{ name: 'Beauty', count: 2 }]);

  await prisma.vendor.update({ where: { id: vendor.id }, data: { status: 'SUSPENDED' } });
  assert.strictEqual((await request(app, 'GET', `/api/stores/${vendor.id}`)).status, 404, 'suspended stores are hidden');
});

test('department content — admin edits it and the category payload returns it', async () => {
  await resetTestDb();
  const app = getApp();
  const { beauty, adminToken } = await setup();
  const sub = await prisma.subcategory.findFirst({ where: { categoryId: beauty.id } });
  const res = await request(app, 'PATCH', `/api/categories/${beauty.id}/subcategories/${sub.id}`, {
    token: adminToken,
    body: { intro: 'All about skin.', guide: [{ title: 'Know your type', body: 'Oily, dry or both.' }], faqs: [{ q: 'SPF daily?', a: 'Yes.' }] },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const page = await request(app, 'GET', '/api/products/categories/beauty');
  const s = page.body.category.subcategories.find((x) => x.name === 'Skincare');
  assert.strictEqual(s.intro, 'All about skin.');
  assert.strictEqual(s.guide[0].title, 'Know your type');
  assert.strictEqual(s.faqs[0].q, 'SPF daily?');
});
