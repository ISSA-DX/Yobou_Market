// Tests for the Placements v1 feature: admin "where shoppers see this
// product" toggles + the CategoryExtra multi-category opt-in join table.
//
// Coverage:
//   1. GET /api/products?showOnHome=false excludes showOnHome=true products.
//   2. GET /api/products?showOnFlashDeals=true returns only the
//      Flash-flagged products.
//   3. Admin POST /api/products/admin with extraCategories writes the
//      join-table rows atomically.
//   4. Admin PATCH replaces the CategoryExtra rows when the field is
//      present; leaves them alone when the field is omitted.
//   5. Vendor POST /api/product-changes records the proposedShow* +
//      proposedExtraCategories on the change row.
//   6. Admin approve (CREATE) applies the proposed placements +
//      extraCategories to the new Product.
//   7. Admin approve (UPDATE) applies only the non-null proposedShow*
//      fields; nulls leave the existing Product values alone.
//   8. CategoryExtra @@unique([productId, name]) rejects duplicate pins.
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

// Make an APPROVED vendor (User + Vendor rows in dependency order) and
// return { user, vendor }. Used by the change-queue tests where the
// product must be owned by the submitting vendor — otherwise the
// productChanges.js POST / 403s on the vendor-ownership check.
async function makeApprovedVendor(businessName = 'Acme') {
  const user = await makeUser('VENDOR');
  const vendor = await prisma.vendor.create({
    data: { userId: user.id, businessName, phone: '+15555550100', status: 'APPROVED', approvedAt: new Date() },
  });
  return { user, vendor };
}

async function makeProduct({
  name = 'Test Product',
  category = 'TestCat',
  showOnHome = true,
  showOnDeals = true,
  showOnFlashDeals = false,
  showOnSearch = true,
  stock = 5,
  extraNames = [],
  vendorId = null,
} = {}) {
  return prisma.product.create({
    data: {
      name,
      description: '',
      priceCents: 1000,
      category,
      imageUrls: '[]',
      stock,
      status: 'LIVE',
      showOnHome,
      showOnDeals,
      showOnFlashDeals,
      showOnSearch,
      vendorId,
      extraCategories: {
        create: extraNames.map((n) => ({ name: n })),
      },
    },
  });
}

test('placements — GET /api/products?showOnHome=false excludes showOnHome=true products', async () => {
  await resetTestDb();
  const app = getApp();
  const onHome = await makeProduct({ name: 'OnHome' });
  const offHome = await makeProduct({ name: 'OffHome', showOnHome: false });

  const res = await request(app, 'GET', '/api/products?showOnHome=false');
  assert.strictEqual(res.status, 200);
  const ids = res.body.products.map((p) => p.id);
  assert.ok(ids.includes(offHome.id), 'showOnHome=false product is in the response');
  assert.ok(!ids.includes(onHome.id), 'showOnHome=true product is NOT in the response');
});

test('placements — GET /api/products?showOnFlashDeals=true returns only Flash-flagged products', async () => {
  await resetTestDb();
  const app = getApp();
  const flash = await makeProduct({ name: 'Flash', showOnFlashDeals: true });
  const notFlash = await makeProduct({ name: 'NotFlash', showOnFlashDeals: false });

  const res = await request(app, 'GET', '/api/products?showOnFlashDeals=true');
  assert.strictEqual(res.status, 200);
  const ids = res.body.products.map((p) => p.id);
  assert.deepStrictEqual(ids, [flash.id]);
  assert.ok(!ids.includes(notFlash.id));
});

test('placements — admin POST /api/products/admin with extraCategories writes the join-table rows', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');

  const res = await request(app, 'POST', '/api/products/admin', {
    token: signAccessFor(admin),
    body: {
      name: 'Pinned',
      description: '',
      priceCents: 1000,
      category: 'Electronics',
      imageUrls: [],
      stock: 5,
      extraCategories: [' Accessories ', '', 'Accessories', 'Audio'],
    },
  });
  assert.strictEqual(res.status, 201);
  // The wire shape should include the cleaned + deduped extras.
  const names = (res.body.product.extraCategories || []).map((e) => e.name);
  assert.deepStrictEqual(names, ['Accessories', 'Audio']);
  // And the join table has 2 rows.
  const rows = await prisma.categoryExtra.findMany({ where: { productId: res.body.product.id } });
  assert.strictEqual(rows.length, 2);
});

test('placements — admin PATCH reconciles CategoryExtra rows when field is present; leaves them alone when omitted', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const product = await makeProduct({ name: 'Orig', extraNames: ['A', 'B'] });

  // PATCH 1: replace the list with a single entry.
  const r1 = await request(app, 'PATCH', `/api/products/${product.id}`, {
    token: signAccessFor(admin),
    body: { extraCategories: ['C'] },
  });
  assert.strictEqual(r1.status, 200);
  const names1 = (r1.body.product.extraCategories || []).map((e) => e.name).sort();
  assert.deepStrictEqual(names1, ['C']);
  const rows1 = await prisma.categoryExtra.findMany({ where: { productId: product.id } });
  assert.strictEqual(rows1.length, 1);

  // PATCH 2: touch an unrelated field; the extras list should NOT change.
  const r2 = await request(app, 'PATCH', `/api/products/${product.id}`, {
    token: signAccessFor(admin),
    body: { stock: 99 },
  });
  assert.strictEqual(r2.status, 200);
  const rows2 = await prisma.categoryExtra.findMany({ where: { productId: product.id } });
  assert.strictEqual(rows2.length, 1, 'PATCH without extraCategories leaves join-table alone');
  assert.strictEqual(rows2[0].name, 'C');
});

test('placements — vendor POST /api/product-changes records proposedShow* + proposedExtraCategories', async () => {
  await resetTestDb();
  const app = getApp();
  const { user: vendorUser, vendor } = await makeApprovedVendor();
  // The product must be owned by the submitting vendor — otherwise
  // the POST /api/product-changes ownership check (line 57) 403s.
  const existing = await makeProduct({ name: 'Existing', vendorId: vendor.id });

  const res = await request(app, 'POST', '/api/product-changes', {
    token: signAccessFor(vendorUser),
    body: {
      productId: existing.id,
      action: 'UPDATE',
      showOnHome: false,
      showOnFlashDeals: true,
      extraCategories: ['Accessories'],
    },
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.change.proposedShowOnHome, false);
  assert.strictEqual(res.body.change.proposedShowOnFlashDeals, true);
  assert.deepStrictEqual(res.body.change.proposedExtraCategories, ['Accessories']);
  // Untouched flags are stored as null (the standard proposed*
  // convention for "leave the existing Product value alone").
  assert.strictEqual(res.body.change.proposedShowOnDeals, null);
});

test('placements — admin approve (CREATE) applies proposed placements + extraCategories to the new Product', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const vendorUser = await makeUser('VENDOR');
  await prisma.vendor.create({
    data: { userId: vendorUser.id, businessName: 'Acme', phone: '+15555550100', status: 'APPROVED', approvedAt: new Date() },
  });

  const submitted = await request(app, 'POST', '/api/product-changes', {
    token: signAccessFor(vendorUser),
    body: {
      action: 'CREATE',
      name: 'NewProduct',
      description: '',
      priceCents: 2000,
      category: 'Electronics',
      imageUrls: [],
      stock: 10,
      showOnFlashDeals: true,
      extraCategories: ['Audio', 'Gaming'],
    },
  });
  assert.strictEqual(submitted.status, 201);

  const approved = await request(app, 'POST', `/api/product-changes/${submitted.body.change.id}/approve`, {
    token: signAccessFor(admin),
  });
  assert.strictEqual(approved.status, 200);
  const product = await prisma.product.findUnique({
    where: { id: approved.body.change.productId },
    include: { extraCategories: true },
  });
  // Vendor explicitly set Flash=true, so it lands true. Other flags
  // are null on the change and fall through to the schema defaults.
  assert.strictEqual(product.showOnHome, true);
  assert.strictEqual(product.showOnDeals, true);
  assert.strictEqual(product.showOnFlashDeals, true);
  assert.strictEqual(product.showOnSearch, true);
  const names = product.extraCategories.map((e) => e.name).sort();
  assert.deepStrictEqual(names, ['Audio', 'Gaming']);
});

test('placements — admin approve (UPDATE) applies only the non-null proposedShow*; nulls leave the existing Product values alone', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const { user: vendorUser, vendor } = await makeApprovedVendor();
  // Existing product: home=true, deals=true, flash=false, search=true.
  // Owned by the submitting vendor so the POST ownership check passes.
  const existing = await makeProduct({ name: 'Existing', extraNames: ['A'], vendorId: vendor.id });

  const submitted = await request(app, 'POST', '/api/product-changes', {
    token: signAccessFor(vendorUser),
    body: {
      productId: existing.id,
      action: 'UPDATE',
      // Only touch showOnFlashDeals. The other flags are null on the
      // change and should be a no-op on the live product.
      showOnFlashDeals: true,
    },
  });
  assert.strictEqual(submitted.status, 201);

  const approved = await request(app, 'POST', `/api/product-changes/${submitted.body.change.id}/approve`, {
    token: signAccessFor(admin),
  });
  assert.strictEqual(approved.status, 200);

  const product = await prisma.product.findUnique({
    where: { id: existing.id },
    include: { extraCategories: true },
  });
  // Touched: showOnFlashDeals flipped to true.
  assert.strictEqual(product.showOnFlashDeals, true);
  // Untouched: all other flags preserved.
  assert.strictEqual(product.showOnHome, true);
  assert.strictEqual(product.showOnDeals, true);
  assert.strictEqual(product.showOnSearch, true);
  // extraCategories wasn't on the change body, so the existing
  // CategoryExtra rows should be left alone.
  const names = product.extraCategories.map((e) => e.name).sort();
  assert.deepStrictEqual(names, ['A']);
});

test('placements — CategoryExtra @@unique([productId, name]) rejects duplicate pins', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct({ name: 'P' });

  await prisma.categoryExtra.create({ data: { productId: product.id, name: 'Accessories' } });
  // The second insert with the same (productId, name) must throw a
  // P2002 unique-violation error. We use a try/catch instead of
  // assert.rejects() so the test message is helpful on failure.
  let threw = null;
  try {
    await prisma.categoryExtra.create({ data: { productId: product.id, name: 'Accessories' } });
  } catch (e) {
    threw = e;
  }
  assert.ok(threw, 'expected duplicate CategoryExtra insert to throw');
  assert.strictEqual(threw.code, 'P2002');
});
