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
  const driver = await makeUser('DRIVER', { phone: '555' });
  const customer = await makeUser('CUSTOMER');
  const stranger = await makeUser('CUSTOMER');
  const vendor = await makeUser('VENDOR', { vendor: { create: { businessName: 'Store', phone: '1', status: 'APPROVED' } } });
  const otherVendor = await makeUser('VENDOR', { vendor: { create: { businessName: 'Other', phone: '2', status: 'APPROVED' } } });
  const addr = await prisma.address.create({ data: { userId: customer.id, line1: 'x', city: 'Dakar', state: 'x', postal: 'x' } });
  const product = await prisma.product.create({
    data: { name: 'P', description: '', priceCents: 1000, category: 'C', imageUrls: '[]', stock: 5, vendorId: vendor.vendor.id },
  });
  const order = await prisma.order.create({
    data: {
      userId: customer.id, addressId: addr.id, totalCents: 1000, paymentMethod: 'CARD', status: 'PAID',
      items: { create: [{ productId: product.id, quantity: 1, priceCents: 1000 }] },
    },
  });
  const app = getApp();
  await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: signAccessFor(admin), body: { driverId: driver.id } });
  const delivery = await prisma.delivery.findUnique({ where: { orderId: order.id } });
  return { app, admin, driver, customer, stranger, vendor, otherVendor, order, delivery };
}

const track = (s, user) => request(s.app, 'GET', `/api/orders/${s.order.id}/tracking`, { token: signAccessFor(user) });
const ping = (s, lat, lng) => request(s.app, 'POST', '/api/driver/location', { token: signAccessFor(s.driver), body: { lat, lng, accuracy: 8 } });

test('tracking — before pickup: vendor and admin see the courier, customer does not', async () => {
  await resetTestDb();
  const s = await seed();
  const r = await ping(s, 14.69, -17.44);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.activeDeliveries, 1);

  const v = await track(s, s.vendor);
  assert.strictEqual(v.body.tracking.audience, 'vendor');
  assert.strictEqual(v.body.tracking.location.lat, 14.69);

  const c = await track(s, s.customer);
  assert.strictEqual(c.body.tracking.audience, 'customer');
  assert.strictEqual(c.body.tracking.location, null);
  assert.strictEqual(c.body.tracking.courier.name, 'DRIVER Test');

  const a = await track(s, s.admin);
  assert.strictEqual(a.body.tracking.location.lng, -17.44);
  assert.strictEqual(a.body.tracking.route.length, 1);
});

test('tracking — after pickup: customer sees courier + route, vendor no longer sees position', async () => {
  await resetTestDb();
  const s = await seed();
  await ping(s, 14.69, -17.44);
  await request(s.app, 'POST', `/api/driver/deliveries/${s.delivery.id}/pickup`, { token: signAccessFor(s.driver) });
  // Force a fresh breadcrumb past the sampling interval.
  await prisma.deliveryPing.updateMany({ where: { deliveryId: s.delivery.id }, data: { at: new Date(Date.now() - 60_000) } });
  await ping(s, 14.70, -17.45);

  const c = await track(s, s.customer);
  assert.strictEqual(c.body.tracking.status, 'PICKED_UP');
  assert.strictEqual(c.body.tracking.location.lat, 14.70);
  assert.ok(c.body.tracking.route.length >= 1);

  const v = await track(s, s.vendor);
  assert.strictEqual(v.body.tracking.location, null);
  assert.deepStrictEqual(v.body.tracking.route, []);
});

test('tracking — delivered: proof-of-delivery GPS stored, live position hidden', async () => {
  await resetTestDb();
  const s = await seed();
  const t = signAccessFor(s.driver);
  await request(s.app, 'POST', `/api/driver/deliveries/${s.delivery.id}/pickup`, { token: t });
  const done = await request(s.app, 'POST', `/api/driver/deliveries/${s.delivery.id}/deliver`, { token: t, body: { lat: 14.71, lng: -17.46, code: s.delivery.deliveryCode } });
  assert.strictEqual(done.status, 200, JSON.stringify(done.body));

  const c = await track(s, s.customer);
  assert.strictEqual(c.body.tracking.location, null);
  assert.deepStrictEqual(c.body.tracking.dropoff, { lat: 14.71, lng: -17.46 });
  const v = await track(s, s.vendor);
  assert.strictEqual(v.body.tracking.dropoff, null);
});

test('tracking — strangers and unrelated vendors are forbidden', async () => {
  await resetTestDb();
  const s = await seed();
  assert.strictEqual((await track(s, s.stranger)).status, 403);
  assert.strictEqual((await track(s, s.otherVendor)).status, 403);
});

test('tracking — off duty hides the courier everywhere; fleet lists duty state', async () => {
  await resetTestDb();
  const s = await seed();
  await ping(s, 14.69, -17.44);
  let fleet = await request(s.app, 'GET', '/api/admin/fleet', { token: signAccessFor(s.admin) });
  assert.strictEqual(fleet.status, 200);
  const me = fleet.body.couriers.find((c) => c.driverId === s.driver.id);
  assert.strictEqual(me.onDuty, true);
  assert.strictEqual(me.activeDeliveries.length, 1);

  const off = await request(s.app, 'POST', '/api/driver/duty', { token: signAccessFor(s.driver), body: { onDuty: false } });
  assert.strictEqual(off.body.onDuty, false);
  fleet = await request(s.app, 'GET', '/api/admin/fleet', { token: signAccessFor(s.admin) });
  assert.strictEqual(fleet.body.couriers.find((c) => c.driverId === s.driver.id).location, null);
  assert.strictEqual((await track(s, s.vendor)).body.tracking.location, null);

  // Only couriers can post GPS; bad coordinates are rejected.
  assert.strictEqual((await request(s.app, 'POST', '/api/driver/location', { token: signAccessFor(s.customer), body: { lat: 1, lng: 1 } })).status, 403);
  assert.strictEqual((await ping(s, 200, 0)).status, 400);
});
