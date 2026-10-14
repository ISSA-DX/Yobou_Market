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

async function seed({ status = 'PAID', paymentMethod = 'CARD' } = {}) {
  const admin = await makeUser('ADMIN');
  const driver = await makeUser('DRIVER', { phone: '555-0199' });
  const otherDriver = await makeUser('DRIVER');
  const customer = await makeUser('CUSTOMER');
  const vendorA = await makeUser('VENDOR', { vendor: { create: { businessName: 'Store A', phone: '1', status: 'APPROVED' } } });
  const vendorB = await makeUser('VENDOR', { vendor: { create: { businessName: 'Store B', phone: '2', status: 'APPROVED' } } });
  const addr = await prisma.address.create({
    data: { userId: customer.id, line1: '1 Market St', city: 'Dakar', state: 'DK', postal: '10000' },
  });
  const mk = (name, vendorId, priceCents) => prisma.product.create({
    data: { name, description: '', priceCents, category: 'C', imageUrls: '[]', stock: 10, status: 'LIVE', vendorId },
  });
  const pA = await mk('Product A', vendorA.vendor.id, 1000);
  const pB = await mk('Secret Product B', vendorB.vendor.id, 3000);
  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      addressId: addr.id,
      subtotalCents: 5000,
      totalCents: 5000,
      paymentMethod,
      status,
      snapshotLine1: '1 Market St',
      snapshotCity: 'Dakar',
      items: { create: [
        { productId: pA.id, quantity: 2, priceCents: 1000 },
        { productId: pB.id, quantity: 1, priceCents: 3000 },
      ] },
    },
  });
  return { admin, driver, otherDriver, customer, vendorA, vendorB, pA, pB, order };
}

test('delivery — full courier lifecycle: assign → pickup → deliver', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, driver, order } = await seed();
  const adminT = signAccessFor(admin);
  const driverT = signAccessFor(driver);

  const queue = await request(app, 'GET', '/api/admin/deliveries/queue', { token: adminT });
  assert.strictEqual(queue.status, 200);
  assert.ok(queue.body.orders.some((o) => o.id === order.id));

  const assign = await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: adminT, body: { driverId: driver.id } });
  assert.strictEqual(assign.status, 200, JSON.stringify(assign.body));
  assert.strictEqual((await prisma.order.findUnique({ where: { id: order.id } })).status, 'PROCESSING');

  const list = await request(app, 'GET', '/api/driver/deliveries', { token: driverT });
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.deliveries.length, 1);
  const job = list.body.deliveries[0];
  assert.strictEqual(job.order.address.city, 'Dakar');
  assert.strictEqual(job.codAmountCents, 0);

  const pickup = await request(app, 'POST', `/api/driver/deliveries/${job.id}/pickup`, { token: driverT });
  assert.strictEqual(pickup.status, 200, JSON.stringify(pickup.body));
  const shipped = await prisma.order.findUnique({ where: { id: order.id } });
  assert.strictEqual(shipped.status, 'SHIPPED');
  assert.strictEqual(shipped.carrier, 'YobouDirect');

  const { deliveryCode } = await prisma.delivery.findUnique({ where: { id: job.id } });
  assert.match(deliveryCode, /^\d{4}$/);
  const wrong = await request(app, 'POST', `/api/driver/deliveries/${job.id}/deliver`, {
    token: driverT, body: { recipientName: 'Awa', code: deliveryCode === '0000' ? '1111' : '0000' },
  });
  assert.strictEqual(wrong.status, 400);
  assert.strictEqual(wrong.body.error, 'INVALID_DELIVERY_CODE');

  const done = await request(app, 'POST', `/api/driver/deliveries/${job.id}/deliver`, { token: driverT, body: { recipientName: 'Awa', code: deliveryCode } });
  assert.strictEqual(done.status, 200, JSON.stringify(done.body));
  assert.strictEqual(done.body.delivery.status, 'DELIVERED');
  assert.strictEqual((await prisma.order.findUnique({ where: { id: order.id } })).status, 'DELIVERED');
});

test('delivery — COD requires the full cash amount and marks the order paid', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, driver, order } = await seed({ status: 'PLACED', paymentMethod: 'COD' });
  await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: signAccessFor(admin), body: { driverId: driver.id } });
  const driverT = signAccessFor(driver);
  const d = await prisma.delivery.findUnique({ where: { orderId: order.id } });
  assert.strictEqual(d.codAmountCents, 5000);
  await request(app, 'POST', `/api/driver/deliveries/${d.id}/pickup`, { token: driverT });

  const short = await request(app, 'POST', `/api/driver/deliveries/${d.id}/deliver`, { token: driverT, body: { codCollectedCents: 4000, code: d.deliveryCode } });
  assert.strictEqual(short.status, 400);
  assert.strictEqual(short.body.error, 'COD_AMOUNT_SHORT');

  const ok = await request(app, 'POST', `/api/driver/deliveries/${d.id}/deliver`, { token: driverT, body: { codCollectedCents: 5000, code: d.deliveryCode } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  const after = await prisma.order.findUnique({ where: { id: order.id } });
  assert.strictEqual(after.status, 'DELIVERED');
  assert.ok(after.paymentTxnId.startsWith('COD-'));
});

test('delivery — failed attempt returns the order to the dispatch queue for re-assignment', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, driver, otherDriver, order } = await seed();
  const adminT = signAccessFor(admin);
  const driverT = signAccessFor(driver);
  await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: adminT, body: { driverId: driver.id } });
  const d = await prisma.delivery.findUnique({ where: { orderId: order.id } });
  await request(app, 'POST', `/api/driver/deliveries/${d.id}/pickup`, { token: driverT });

  const fail = await request(app, 'POST', `/api/driver/deliveries/${d.id}/fail`, { token: driverT, body: { reason: 'Customer not home' } });
  assert.strictEqual(fail.status, 200, JSON.stringify(fail.body));
  assert.strictEqual(fail.body.delivery.attempts, 1);

  const queue = await request(app, 'GET', '/api/admin/deliveries/queue', { token: adminT });
  assert.ok(queue.body.orders.some((o) => o.id === order.id), 'failed delivery should be back in the queue');

  const re = await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: adminT, body: { driverId: otherDriver.id } });
  assert.strictEqual(re.status, 200, JSON.stringify(re.body));
  assert.strictEqual(re.body.delivery.status, 'ASSIGNED');
  assert.strictEqual(re.body.delivery.driverId, otherDriver.id);
});

test('delivery — couriers only see and act on their own jobs; non-drivers are rejected', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, driver, otherDriver, customer, order } = await seed();
  await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: signAccessFor(admin), body: { driverId: driver.id } });
  const d = await prisma.delivery.findUnique({ where: { orderId: order.id } });

  const otherT = signAccessFor(otherDriver);
  assert.strictEqual((await request(app, 'GET', '/api/driver/deliveries', { token: otherT })).body.deliveries.length, 0);
  assert.strictEqual((await request(app, 'POST', `/api/driver/deliveries/${d.id}/pickup`, { token: otherT })).status, 404);
  assert.strictEqual((await request(app, 'GET', '/api/driver/deliveries', { token: signAccessFor(customer) })).status, 403);
  // Only DRIVER accounts can be assigned.
  const bad = await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: signAccessFor(admin), body: { driverId: customer.id } });
  assert.strictEqual(bad.body.error, 'NOT_A_DRIVER');
});

test('delivery — vendor cannot self-deliver an order handled by a courier', async () => {
  await resetTestDb();
  const app = getApp();
  const { admin, driver, vendorA, order } = await seed();
  await request(app, 'POST', `/api/admin/orders/${order.id}/assign-driver`, { token: signAccessFor(admin), body: { driverId: driver.id } });
  const res = await request(app, 'POST', `/api/orders/vendor/${order.id}/ship`, {
    token: signAccessFor(vendorA),
    body: { carrier: 'DHL', trackingNumber: 'X1' },
  });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.body.error, 'COURIER_MANAGED');
});

test('admin — creates courier accounts and lists them with workload', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);
  const created = await request(app, 'POST', '/api/admin/drivers', {
    token, body: { name: 'Moussa', email: 'Moussa@Courier.test', password: 'Courier123!', phone: '+221 77 000 00 00' },
  });
  assert.strictEqual(created.status, 201, JSON.stringify(created.body));
  const user = await prisma.user.findUnique({ where: { email: 'moussa@courier.test' } });
  assert.strictEqual(user.role, 'DRIVER');
  const dup = await request(app, 'POST', '/api/admin/drivers', {
    token, body: { name: 'X', email: 'moussa@courier.test', password: 'Courier123!', phone: '12345' },
  });
  assert.strictEqual(dup.status, 409);
  const list = await request(app, 'GET', '/api/admin/drivers', { token });
  assert.strictEqual(list.body.drivers.length, 1);
});

test('vendor scope — mixed-store order only exposes the vendor\'s own items and share', async () => {
  await resetTestDb();
  const app = getApp();
  const { vendorA, order } = await seed();
  const token = signAccessFor(vendorA);

  const detail = await request(app, 'GET', `/api/orders/${order.id}`, { token });
  assert.strictEqual(detail.status, 200);
  assert.deepStrictEqual(detail.body.order.items.map((i) => i.product.name), ['Product A']);
  assert.strictEqual(detail.body.order.totalCents, 2000);
  assert.ok(!JSON.stringify(detail.body).includes('Secret Product B'));

  const mine = await request(app, 'GET', '/api/orders/vendor/mine', { token });
  assert.strictEqual(mine.body.orders[0].items.length, 1);
  assert.ok(!JSON.stringify(mine.body).includes('Secret Product B'));
});

test('vendor scope — GET /api/products/vendor/:id returns own product, 404 for another store', async () => {
  await resetTestDb();
  const app = getApp();
  const { vendorA, pA, pB } = await seed();
  const token = signAccessFor(vendorA);
  assert.strictEqual((await request(app, 'GET', `/api/products/vendor/${pA.id}`, { token })).status, 200);
  assert.strictEqual((await request(app, 'GET', `/api/products/vendor/${pB.id}`, { token })).status, 404);
});
