// Tests for the optional compare-at / deal price field.
//
// Wire shape:
//   - Product.compareAtPriceCents (USD cents, nullable) — what shoppers see.
//   - ProductChange.proposedCompareAtPriceCents (nullable) — what a vendor
//     proposes; null in the change means "leave the live product's value
//     alone", a number means "apply this", explicit null in the body means
//     "remove the deal".
//
// Contract:
//   - Empty form value (no deal) → null on the product. The storefront
//     silently does not render a strikethrough or "% off" badge.
//   - compareAt must be strictly greater than priceCents. The validator
//     rejects compareAt <= priceCents at parse time on CREATE, and the
//     route handler re-validates against the live product on UPDATE
//     approval so a stale change can't be approved after the live price
//     moved up to meet the deal.
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

async function makeApprovedVendor() {
  const user = await makeUser('VENDOR');
  return prisma.vendor.create({
    data: {
      userId: user.id,
      businessName: 'Acme Co',
      phone: '+15555550100',
      status: 'APPROVED',
      approvedAt: new Date(),
    },
  });
}

test('compare-at — admin POST /api/products/admin persists compareAtPriceCents and returns it on GET', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'Wireless Earbuds',
      description: '',
      priceCents: 7999,
      compareAtPriceCents: 12999,
      category: 'Electronics',
      imageUrls: [],
      stock: 5,
      status: 'LIVE',
    },
  });
  assert.strictEqual(create.status, 201);
  assert.strictEqual(create.body.product.compareAtPriceCents, 12999);

  // Public list returns the field so the storefront can render the deal.
  const list = await request(app, 'GET', '/api/products');
  assert.strictEqual(list.status, 200);
  const row = list.body.products.find((p) => p.id === create.body.product.id);
  assert.ok(row, 'product should be in public list');
  assert.strictEqual(row.compareAtPriceCents, 12999);
});

test('compare-at — admin POST /api/products/admin rejects compareAt <= price', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'Mug',
      description: '',
      priceCents: 1999,
      compareAtPriceCents: 1999, // equal — must reject
      category: 'Home',
      imageUrls: [],
      stock: 1,
      status: 'LIVE',
    },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'INVALID_INPUT');
  const path = res.body.issues?.[0]?.path?.[0];
  assert.strictEqual(path, 'compareAtPriceCents');
});

test('compare-at — admin PATCH /api/products/:id can set then clear the deal', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'Notebook',
      description: '',
      priceCents: 499,
      category: 'Office',
      imageUrls: [],
      stock: 10,
      status: 'LIVE',
    },
  });
  assert.strictEqual(create.status, 201);
  assert.strictEqual(create.body.product.compareAtPriceCents, null);

  // Set a deal.
  const setDeal = await request(app, 'PATCH', `/api/products/${create.body.product.id}`, {
    token,
    body: { compareAtPriceCents: 799 },
  });
  assert.strictEqual(setDeal.status, 200);
  assert.strictEqual(setDeal.body.product.compareAtPriceCents, 799);

  // Clear the deal by passing null. Public list reflects the change.
  const clear = await request(app, 'PATCH', `/api/products/${create.body.product.id}`, {
    token,
    body: { compareAtPriceCents: null },
  });
  assert.strictEqual(clear.status, 200);
  assert.strictEqual(clear.body.product.compareAtPriceCents, null);

  const list = await request(app, 'GET', '/api/products');
  const row = list.body.products.find((p) => p.id === create.body.product.id);
  assert.strictEqual(row.compareAtPriceCents, null);
});

test('compare-at — vendor CREATE change carries compareAt; approval applies it to Product', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const vendor = await makeApprovedVendor();
  const vendorUser = await prisma.user.findUnique({ where: { id: vendor.userId } });
  const vendorToken = signAccessFor(vendorUser);

  const submit = await request(app, 'POST', '/api/products', {
    token: vendorToken,
    body: {
      name: 'Yoga Mat',
      description: 'non-slip',
      priceCents: 2499,
      compareAtPriceCents: 3999,
      category: 'Sports',
      imageUrls: [],
      stock: 7,
      status: 'LIVE',
    },
  });
  assert.strictEqual(submit.status, 201);
  assert.strictEqual(submit.body.change.proposedCompareAtPriceCents, 3999);

  // Admin approves the change.
  const adminToken = signAccessFor(admin);
  const changeId = submit.body.change.id;
  const approve = await request(app, 'POST', `/api/product-changes/${changeId}/approve`, {
    token: adminToken,
    body: {},
  });
  assert.strictEqual(approve.status, 200);

  // The live product should now have compareAtPriceCents set.
  const product = await prisma.product.findUnique({ where: { id: approve.body.change.productId } });
  assert.ok(product, 'product should exist after approval');
  assert.strictEqual(product.compareAtPriceCents, 3999);
});

test('compare-at — vendor UPDATE change with compareAt < current live price fails on approve', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const vendor = await makeApprovedVendor();
  const vendorUser = await prisma.user.findUnique({ where: { id: vendor.userId } });
  const vendorToken = signAccessFor(vendorUser);

  // Live product: $20.00, no deal.
  const live = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      name: 'Bottle',
      description: '',
      priceCents: 2000,
      category: 'Kitchen',
      imageUrls: '[]',
      stock: 5,
      status: 'LIVE',
    },
  });

  // Vendor submits a $30 deal — fine at submit time.
  const submit = await request(app, 'PATCH', `/api/products/${live.id}`, {
    token: vendorToken,
    body: { compareAtPriceCents: 3000 },
  });
  assert.strictEqual(submit.status, 202);

  // Now the live price moves up to $35 (admin action). The $30 deal no
  // longer satisfies compareAt > priceCents.
  const adminToken = signAccessFor(admin);
  await prisma.product.update({ where: { id: live.id }, data: { priceCents: 3500 } });

  // Approving the stale change must return 409 INVALID_COMPARE_AT
  // because the live price moved up to make the deal invalid. The
  // request helper never throws — it always returns the response.
  const approve = await request(app, 'POST', `/api/product-changes/${submit.body.change.id}/approve`, {
    token: adminToken,
    body: {},
  });
  assert.strictEqual(approve.status, 409);
  assert.strictEqual(approve.body.error, 'INVALID_COMPARE_AT');

  // The live product is untouched.
  const after = await prisma.product.findUnique({ where: { id: live.id } });
  assert.strictEqual(after.compareAtPriceCents, null);
  assert.strictEqual(after.priceCents, 3500);
});

test('compare-at — vendor UPDATE with compareAt <= priceCents in body fails at submit', async () => {
  await resetTestDb();
  const app = getApp();
  const vendor = await makeApprovedVendor();
  const vendorUser = await prisma.user.findUnique({ where: { id: vendor.userId } });
  const vendorToken = signAccessFor(vendorUser);

  const live = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      name: 'Bottle',
      description: '',
      priceCents: 2000,
      category: 'Kitchen',
      imageUrls: '[]',
      stock: 5,
      status: 'LIVE',
    },
  });

  // compareAt == price → invalid.
  const res = await request(app, 'PATCH', `/api/products/${live.id}`, {
    token: vendorToken,
    body: { compareAtPriceCents: 2000 },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'INVALID_INPUT');
  const path = res.body.issues?.[0]?.path?.[0];
  assert.strictEqual(path, 'compareAtPriceCents');
});

test('compare-at — vendor UPDATE leaving the field absent preserves the existing deal', async () => {
  await resetTestDb();
  const app = getApp();
  const vendor = await makeApprovedVendor();
  const vendorUser = await prisma.user.findUnique({ where: { id: vendor.userId } });
  const vendorToken = signAccessFor(vendorUser);

  const live = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      name: 'Bottle',
      description: 'old desc',
      priceCents: 2000,
      compareAtPriceCents: 3000,
      category: 'Kitchen',
      imageUrls: '[]',
      stock: 5,
      status: 'LIVE',
    },
  });

  // Vendor updates only the description — compareAt absent in body.
  const submit = await request(app, 'PATCH', `/api/products/${live.id}`, {
    token: vendorToken,
    body: { description: 'new desc' },
  });
  assert.strictEqual(submit.status, 202);
  // proposedCompareAtPriceCents is null = "don't touch" on approval.
  assert.strictEqual(submit.body.change.proposedCompareAtPriceCents, null);
});
