const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { getApp, resetTestDb, prisma, signAccessFor } = require('./helper');

let app;
let adminToken;
let adminUser;

async function tokenFor({ email, name, role, vendorStatus }) {
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash: 'x',
      ...(role === 'VENDOR' ? {
        vendor: {
          create: {
            businessName: name + ' Co',
            phone: '+10000000000',
            status: vendorStatus || 'PENDING',
            approvedAt: vendorStatus === 'APPROVED' ? new Date() : null,
          },
        },
      } : {}),
    },
    include: { vendor: true },
  });
  return { token: signAccessFor(user), user };
}

test.before(async () => {
  app = getApp();
  await resetTestDb();
  // Create an admin who'll approve changes.
  const admin = await prisma.user.create({
    data: { email: 'admin-analytics@example.com', name: 'Admin', role: 'ADMIN', passwordHash: 'x' },
  });
  adminUser = admin;
  adminToken = signAccessFor(admin);
});

test('vendor analytics returns kpis + revenueByDay + topProducts scoped to vendor', async () => {
  // Approved vendor with 2 products.
  const { token: vToken, user: vUser } = await tokenFor({
    email: 'v-analytics@example.com',
    name: 'Analytics Vendor',
    role: 'VENDOR',
    vendorStatus: 'APPROVED',
  });
  const vendor = await prisma.vendor.findUnique({ where: { userId: vUser.id } });

  // Create two products directly (skip the change-approval flow to keep the test
  // focused on analytics — the test exercises the analytics aggregation, not
  // product creation).
  await prisma.product.create({
    data: {
      vendorId: vendor.id, name: 'Alpha Widget', description: '',
      priceCents: 1000, category: 'Electronics', stock: 10, status: 'LIVE',
      imageUrls: '[]',
    },
  });
  const beta = await prisma.product.create({
    data: {
      vendorId: vendor.id, name: 'Beta Widget', description: '',
      priceCents: 2500, category: 'Electronics', stock: 10, status: 'LIVE',
      imageUrls: '[]',
    },
  });
  const alpha = await prisma.product.findFirst({
    where: { vendorId: vendor.id, name: 'Alpha Widget' },
  });

  // Place a PAID order for 1x Alpha via the public order flow.
  const { token: cToken, user: cUser } = await tokenFor({
    email: 'c-analytics@example.com', name: 'Analytics Customer', role: 'CUSTOMER',
  });
  const addr = await prisma.address.create({
    data: {
      userId: cUser.id, line1: '1 Test St', city: 'Testville',
      state: 'CA', postal: '90001', isDefault: true,
    },
  });
  await request(app).post('/api/cart')
    .set('Authorization', `Bearer ${cToken}`)
    .send({ productId: alpha.id, quantity: 1 })
    .expect(201);
  await request(app).post('/api/orders')
    .set('Authorization', `Bearer ${cToken}`)
    .send({
      addressId: addr.id, paymentMethod: 'CARD',
      card: { number: '4111111111111111', name: 'Analytics Customer', cvv: '123', expiry: '12/30' },
    })
    .expect(201);

  // Hit the analytics endpoint.
  const res = await request(app).get('/api/vendor/analytics?days=14')
    .set('Authorization', `Bearer ${vToken}`)
    .expect(200);

  assert.strictEqual(res.body.kpis.products, 2, 'vendor should see 2 own products');
  assert.strictEqual(res.body.kpis.live, 2, 'both products are LIVE');
  assert.ok(Array.isArray(res.body.revenueByDay));
  assert.strictEqual(res.body.revenueByDay.length, 14, '14-day window populated');
  assert.ok(Array.isArray(res.body.topProducts));
  assert.ok(res.body.topProducts.length >= 1, 'Alpha had at least 1 sale');
  assert.ok(
    res.body.topProducts.some((p) => p.name === 'Alpha Widget'),
    'Alpha Widget appears in topProducts after a sale',
  );
  // Beta had 0 sales — should NOT appear (or appears with 0 revenue if seed).
  // Top list is sorted by revenue desc, so Beta is not in the top.
  const names = res.body.topProducts.map((p) => p.name);
  assert.ok(!names.includes('Beta Widget'), 'Beta (no sales) excluded from top list');

  // Sanity: at least one day in the window has Alpha's revenue (1000 cents).
  const totalRevenue = res.body.revenueByDay.reduce((a, d) => a + d.cents, 0);
  assert.ok(totalRevenue >= 1000, 'revenue from Alpha sale counted');

  void beta; // referenced for setup
  void adminToken; void adminUser;
});

test('vendor analytics rejects unauthenticated', async () => {
  await request(app).get('/api/vendor/analytics').expect(401);
});

test('vendor analytics rejects pending vendor', async () => {
  const { token } = await tokenFor({
    email: 'v-pending-analytics@example.com',
    name: 'Pending Analytics',
    role: 'VENDOR',
    vendorStatus: 'PENDING',
  });
  await request(app).get('/api/vendor/analytics?days=14')
    .set('Authorization', `Bearer ${token}`)
    .expect(403);
});

test('vendor analytics clamps days to [1, 90]', async () => {
  const { token } = await tokenFor({
    email: 'v-clamp@example.com',
    name: 'Clamp Vendor',
    role: 'VENDOR',
    vendorStatus: 'APPROVED',
  });
  const r1 = await request(app).get('/api/vendor/analytics?days=9999')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(r1.body.revenueByDay.length, 90, 'days clamped to 90');
  // days=0 is invalid → fall back to default 14.
  const r2 = await request(app).get('/api/vendor/analytics?days=0')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(r2.body.revenueByDay.length, 14, 'days=0 falls back to default 14');
  // days=1 → exactly 1.
  const r3 = await request(app).get('/api/vendor/analytics?days=1')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(r3.body.revenueByDay.length, 1, 'days=1 honored');
});