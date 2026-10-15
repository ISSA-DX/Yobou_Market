// Placement system: category pins appear on the pinned category /
// department pages and in their counts; the Category spotlight flag
// travels through the partner approval queue; the admin bulk tool can
// move products to a department and pin them elsewhere.
const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role) {
  return prisma.user.create({
    data: { email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@test.local`, name: role, passwordHash: 'x', role },
  });
}

async function setupCatalogue() {
  const kitchen = await prisma.category.create({ data: { name: 'Kitchen', slug: 'kitchen' } });
  await prisma.subcategory.create({ data: { categoryId: kitchen.id, name: 'Cookware', slug: 'cookware' } });
  const home = await prisma.category.create({ data: { name: 'Home', slug: 'home' } });
  await prisma.subcategory.create({ data: { categoryId: home.id, name: 'Décor', slug: 'decor' } });
  const skillet = await prisma.product.create({
    data: { name: 'Skillet', description: '', priceCents: 3000, stock: 5, status: 'LIVE', category: 'Kitchen', subcategory: 'Cookware' },
  });
  return { skillet };
}

test('pins — a product pinned to Home › Décor is listed there and counted', async () => {
  await resetTestDb();
  const app = getApp();
  const { skillet } = await setupCatalogue();
  await prisma.categoryExtra.create({ data: { productId: skillet.id, name: 'Home', subcategory: 'Décor' } });

  const homePage = await request(app, 'GET', '/api/products?category=Home');
  assert.deepStrictEqual(homePage.body.products.map((p) => p.name), ['Skillet']);
  assert.deepStrictEqual(homePage.body.products[0].extraCategories.map((e) => [e.name, e.subcategory]), [['Home', 'Décor']]);

  const decor = await request(app, 'GET', `/api/products?category=Home&subcategory=${encodeURIComponent('Décor')}`);
  assert.strictEqual(decor.body.products.length, 1);

  // Still on its own primary page.
  const kitchen = await request(app, 'GET', '/api/products?category=Kitchen&subcategory=Cookware');
  assert.strictEqual(kitchen.body.products.length, 1);

  const cat = await request(app, 'GET', '/api/products/categories/home');
  assert.strictEqual(cat.body.category.productCount, 1);
  assert.strictEqual(cat.body.category.subcategories.find((s) => s.name === 'Décor').productCount, 1);
});

test('spotlight — partner proposal carries the flag and department pins through approval', async () => {
  await resetTestDb();
  const app = getApp();
  await setupCatalogue();
  const admin = await makeUser('ADMIN');
  const vendorUser = await makeUser('VENDOR');
  await prisma.vendor.create({ data: { userId: vendorUser.id, businessName: 'Acme', phone: '+15555550100', status: 'APPROVED' } });

  const submit = await request(app, 'POST', '/api/products', {
    token: signAccessFor(vendorUser),
    body: {
      name: 'Dutch Oven', priceCents: 6000, category: 'Kitchen', subcategory: 'Cookware',
      showOnCategorySpotlight: true,
      extraCategories: [{ name: 'Home', subcategory: 'Décor' }],
    },
  });
  assert.strictEqual(submit.status, 201, JSON.stringify(submit.body));
  assert.strictEqual(submit.body.change.proposedShowOnCategorySpotlight, true);

  const approve = await request(app, 'POST', `/api/product-changes/${submit.body.change.id}/approve`, { token: signAccessFor(admin), body: {} });
  assert.ok(approve.status < 300, JSON.stringify(approve.body));
  const p = await prisma.product.findFirst({ where: { name: 'Dutch Oven' }, include: { extraCategories: true } });
  assert.strictEqual(p.showOnCategorySpotlight, true);
  assert.deepStrictEqual(p.extraCategories.map((e) => [e.name, e.subcategory]), [['Home', 'Décor']]);

  const spot = await request(app, 'GET', '/api/products?category=Kitchen&showOnCategorySpotlight=true');
  assert.deepStrictEqual(spot.body.products.map((x) => x.name), ['Dutch Oven']);
});

test('bulk — move to a department, pin elsewhere, unpin, and toggle the spotlight', async () => {
  await resetTestDb();
  const app = getApp();
  const { skillet } = await setupCatalogue();
  const token = signAccessFor(await makeUser('ADMIN'));
  const bulk = (body) => request(app, 'POST', '/api/admin/products/bulk', { token, body: { ids: [skillet.id], ...body } });

  let res = await bulk({ action: 'setDepartment', value: { category: 'Home', subcategory: 'Décor' } });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  let p = await prisma.product.findUnique({ where: { id: skillet.id } });
  assert.deepStrictEqual([p.category, p.subcategory], ['Home', 'Décor']);

  res = await bulk({ action: 'pin', value: { category: 'Kitchen', subcategory: 'Cookware', on: true } });
  assert.strictEqual(res.body.updated, 1);
  assert.strictEqual(await prisma.categoryExtra.count({ where: { productId: skillet.id, name: 'Kitchen' } }), 1);

  res = await bulk({ action: 'pin', value: { category: 'Kitchen', on: false } });
  assert.strictEqual(await prisma.categoryExtra.count({ where: { productId: skillet.id } }), 0);

  res = await bulk({ action: 'setPlacement', value: { flag: 'showOnCategorySpotlight', on: true } });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  p = await prisma.product.findUnique({ where: { id: skillet.id } });
  assert.strictEqual(p.showOnCategorySpotlight, true);
});
