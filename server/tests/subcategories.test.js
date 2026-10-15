// Tests for the Category → Subcategory layer: admin CRUD, rename
// carrying products along, archive-when-in-use, the public category
// page payload, and the ?subcategory= storefront filter.
const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: 'x',
      role,
    },
  });
}

async function makeProduct(data) {
  return prisma.product.create({
    data: { description: '', priceCents: 1000, stock: 5, status: 'LIVE', ...data },
  });
}

test('subcategories — admin can create, rename and archive; products follow renames', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);
  const cat = await prisma.category.create({ data: { name: 'Phones', slug: 'phones' } });

  const created = await request(app, 'POST', `/api/categories/${cat.id}/subcategories`, {
    token,
    body: { name: 'Smartphones', description: 'All the phones.' },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  const sub = created.body.category.subcategories[0];
  assert.strictEqual(sub.slug, 'smartphones');

  const dup = await request(app, 'POST', `/api/categories/${cat.id}/subcategories`, { token, body: { name: 'Smartphones' } });
  assert.strictEqual(dup.status, 409);

  await makeProduct({ name: 'Phone A', category: 'Phones', subcategory: 'Smartphones' });
  const renamed = await request(app, 'PATCH', `/api/categories/${cat.id}/subcategories/${sub.id}`, {
    token,
    body: { name: 'Mobile Phones' },
  });
  assert.strictEqual(renamed.status, 200, JSON.stringify(renamed.body));
  const product = await prisma.product.findFirst({ where: { name: 'Phone A' } });
  assert.strictEqual(product.subcategory, 'Mobile Phones');

  // In use → archived, not deleted.
  const del = await request(app, 'DELETE', `/api/categories/${cat.id}/subcategories/${sub.id}`, { token });
  assert.strictEqual(del.status, 200);
  assert.strictEqual(del.body.archived, true);
  const row = await prisma.subcategory.findUnique({ where: { id: sub.id } });
  assert.strictEqual(row.isActive, false);
});

test('subcategories — writes are admin-only', async () => {
  await resetTestDb();
  const app = getApp();
  const vendor = await makeUser('VENDOR');
  const cat = await prisma.category.create({ data: { name: 'Books', slug: 'books' } });
  const res = await request(app, 'POST', `/api/categories/${cat.id}/subcategories`, {
    token: signAccessFor(vendor),
    body: { name: 'Fiction' },
  });
  assert.strictEqual(res.status, 403);
});

test('category page — public payload resolves slug or legacy name, with subcategory counts', async () => {
  await resetTestDb();
  const app = getApp();
  const cat = await prisma.category.create({
    data: {
      name: 'TV & Audio',
      slug: 'tv-audio',
      tagline: 'Big screens.',
      guide: JSON.stringify([{ title: 'Size it', body: 'Measure.' }]),
      faqs: JSON.stringify([{ q: 'Mount?', a: 'No.' }]),
    },
  });
  await prisma.subcategory.create({ data: { categoryId: cat.id, name: 'Televisions', slug: 'televisions', sortOrder: 1 } });
  await prisma.subcategory.create({ data: { categoryId: cat.id, name: 'Speakers', slug: 'speakers', sortOrder: 2, isActive: false } });
  await makeProduct({ name: 'TV 1', category: 'TV & Audio', subcategory: 'Televisions' });
  await makeProduct({ name: 'TV 2', category: 'TV & Audio', subcategory: 'Televisions' });
  await makeProduct({ name: 'Cable', category: 'TV & Audio' });

  for (const key of ['tv-audio', encodeURIComponent('TV & Audio')]) {
    const res = await request(app, 'GET', `/api/products/categories/${key}`);
    assert.strictEqual(res.status, 200, `${key}: ${JSON.stringify(res.body)}`);
    const c = res.body.category;
    assert.strictEqual(c.name, 'TV & Audio');
    assert.strictEqual(c.productCount, 3);
    assert.deepStrictEqual(c.subcategories.map((s) => [s.name, s.productCount]), [['Televisions', 2]], 'inactive subcategories hidden');
    assert.strictEqual(c.guide[0].title, 'Size it');
    assert.strictEqual(c.faqs[0].q, 'Mount?');
  }

  const missing = await request(app, 'GET', '/api/products/categories/nope');
  assert.strictEqual(missing.status, 404);

  const list = await request(app, 'GET', '/api/products?category=TV%20%26%20Audio&subcategory=Televisions');
  assert.strictEqual(list.status, 200);
  assert.deepStrictEqual(list.body.products.map((p) => p.name).sort(), ['TV 1', 'TV 2']);
});

test('subcategories — vendor proposal carries the subcategory through approval', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const vendorUser = await makeUser('VENDOR');
  await prisma.vendor.create({
    data: { userId: vendorUser.id, businessName: 'Acme', phone: '+15555550100', status: 'APPROVED' },
  });
  const vendorToken = signAccessFor(vendorUser);

  const submit = await request(app, 'POST', '/api/products', {
    token: vendorToken,
    body: { name: 'Earbuds', priceCents: 1000, category: 'Electronics', subcategory: 'Audio & Headphones' },
  });
  assert.strictEqual(submit.status, 201, JSON.stringify(submit.body));
  const changeId = submit.body.change.id;

  const approve = await request(app, 'POST', `/api/product-changes/${changeId}/approve`, { token: signAccessFor(admin), body: {} });
  assert.ok(approve.status < 300, JSON.stringify(approve.body));
  const p = await prisma.product.findFirst({ where: { name: 'Earbuds' } });
  assert.strictEqual(p.subcategory, 'Audio & Headphones');
});
