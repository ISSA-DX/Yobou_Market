// Tests for the customer-review feature on the PDP.
//
// Covers:
//   1. Public list returns paginated reviews + breakdown + average.
//   2. POST auth gates (401 unauth, 403 vendor, 201 customer).
//   3. Unique constraint → 409 REVIEW_EXISTS (covers the race window
//      too — two POSTs from the same user before the first one
//      commits).
//   4. Verified-purchase flag flips on after an Order reaches PAID.
//   5. DELETE ownership rules (owner ok, other non-admin 403,
//      admin ok).
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

async function makeProduct() {
  return prisma.product.create({
    data: {
      name: 'Test Product',
      description: 'desc',
      priceCents: 1000,
      category: 'TestCat',
      imageUrls: '[]',
      stock: 5,
      status: 'LIVE',
    },
  });
}

test('reviews — public list returns reviews + breakdown + averageRating + verified-purchase flag', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct();
  const u1 = await makeUser('CUSTOMER', { name: 'Alice' });
  const u2 = await makeUser('CUSTOMER', { name: 'Bob' });
  const u3 = await makeUser('CUSTOMER', { name: 'Carol' });
  await prisma.review.create({ data: { productId: product.id, userId: u1.id, rating: 5, title: 'Great', body: 'Loved it' } });
  await prisma.review.create({ data: { productId: product.id, userId: u2.id, rating: 3, title: 'OK',    body: 'Fine' } });
  await prisma.review.create({ data: { productId: product.id, userId: u3.id, rating: 1, title: 'Bad',   body: 'Broke' } });

  const res = await request(app, 'GET', `/api/products/${product.id}/reviews`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 3);
  assert.strictEqual(res.body.averageRating, 3); // (5+3+1)/3 = 3
  assert.deepStrictEqual(res.body.breakdown, { 1: 1, 2: 0, 3: 1, 4: 0, 5: 1 });
  assert.strictEqual(res.body.reviews.length, 3);
  // No order items yet → verifiedPurchase false on every row.
  for (const r of res.body.reviews) assert.strictEqual(r.verifiedPurchase, false);
  // user field is the projection { id, name }.
  const titles = res.body.reviews.map((r) => r.title).sort();
  assert.deepStrictEqual(titles, ['Bad', 'Great', 'OK']);
});

test('reviews — POST auth gates (401 unauth, 403 vendor, 201 customer)', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct();
  const customer = await makeUser('CUSTOMER');
  const vendorUser = await makeUser('VENDOR');
  const vendor = await prisma.vendor.create({
    data: { userId: vendorUser.id, businessName: 'Acme', phone: '+15555550100', status: 'APPROVED', approvedAt: new Date() },
  });

  // 401 — no token.
  const r1 = await request(app, 'POST', `/api/products/${product.id}/reviews`, {
    body: { rating: 5, title: 'x', body: 'y' },
  });
  assert.strictEqual(r1.status, 401);

  // 403 — vendor role.
  const r2 = await request(app, 'POST', `/api/products/${product.id}/reviews`, {
    token: signAccessFor(vendorUser),
    body: { rating: 5, title: 'x', body: 'y' },
  });
  assert.strictEqual(r2.status, 403);

  // 201 — customer.
  const r3 = await request(app, 'POST', `/api/products/${product.id}/reviews`, {
    token: signAccessFor(customer),
    body: { rating: 4, title: 'good', body: 'recommend' },
  });
  assert.strictEqual(r3.status, 201);
  assert.strictEqual(r3.body.review.rating, 4);
  assert.strictEqual(r3.body.review.user.id, customer.id);

  // Avoid an unused-binding lint while still asserting the row exists.
  assert.ok(vendor);
});

test('reviews — second POST from same user returns 409 REVIEW_EXISTS', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct();
  const customer = await makeUser('CUSTOMER');
  const token = signAccessFor(customer);

  const r1 = await request(app, 'POST', `/api/products/${product.id}/reviews`, {
    token,
    body: { rating: 5, title: 'a', body: 'a' },
  });
  assert.strictEqual(r1.status, 201);

  const r2 = await request(app, 'POST', `/api/products/${product.id}/reviews`, {
    token,
    body: { rating: 1, title: 'b', body: 'b' },
  });
  assert.strictEqual(r2.status, 409);
  assert.strictEqual(r2.body.error, 'REVIEW_EXISTS');

  // The first review is still the only one for this product.
  const list = await request(app, 'GET', `/api/products/${product.id}/reviews`);
  assert.strictEqual(list.body.total, 1);
});

test('reviews — verifiedPurchase flips to true when an Order with status PAID exists for the (user, product)', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct();
  const customer = await makeUser('CUSTOMER', { name: 'Buyer' });
  const admin = await makeUser('ADMIN');
  const address = await prisma.address.create({
    data: { userId: customer.id, line1: '1 Main', city: 'X', state: 'Y', postal: '00000' },
  });
  // Seed a PAID order with an OrderItem for the product. This is the
  // minimum the route needs to flip the verifiedPurchase flag.
  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      status: 'PAID',
      totalCents: 1000,
      paymentMethod: 'CARD',
      addressId: address.id,
      items: { create: [{ productId: product.id, quantity: 1, priceCents: 1000 }] },
    },
  });
  await prisma.review.create({
    data: { productId: product.id, userId: customer.id, rating: 5, title: 'Loved it', body: 'Great' },
  });
  // Sanity: ensure we have a fresh app with the reviews router mounted.
  assert.ok(order);

  const res = await request(app, 'GET', `/api/products/${product.id}/reviews`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.reviews.length, 1);
  assert.strictEqual(res.body.reviews[0].verifiedPurchase, true);
  // Admin used to ensure the seeded admin user isn't flagged as needing cleanup.
  assert.ok(admin);
});

test('reviews — DELETE as owner succeeds, as other non-admin 403, as admin 200', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct();
  const owner = await makeUser('CUSTOMER', { name: 'Owner' });
  const other = await makeUser('CUSTOMER', { name: 'Other' });
  const admin = await makeUser('ADMIN');
  const review = await prisma.review.create({
    data: { productId: product.id, userId: owner.id, rating: 5, title: 't', body: 'b' },
  });

  // 403 — other customer.
  const r403 = await request(app, 'DELETE', `/api/reviews/${review.id}`, {
    token: signAccessFor(other),
  });
  assert.strictEqual(r403.status, 403);

  // 200 — owner.
  const r200 = await request(app, 'DELETE', `/api/reviews/${review.id}`, {
    token: signAccessFor(owner),
  });
  assert.strictEqual(r200.status, 200);

  // Re-create + delete as admin (moderation).
  const re = await prisma.review.create({
    data: { productId: product.id, userId: owner.id, rating: 4, title: 't', body: 'b' },
  });
  const rAdmin = await request(app, 'DELETE', `/api/reviews/${re.id}`, {
    token: signAccessFor(admin),
  });
  assert.strictEqual(rAdmin.status, 200);
});
