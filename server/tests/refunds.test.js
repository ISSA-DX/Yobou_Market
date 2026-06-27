const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');

let app;

describe('Refunds API', { concurrency: 1 }, () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  let counter = 0;
  async function seedAdmin() {
    counter += 1;
    const email = `refunds-admin-${counter}@test.com`;
    const bcrypt = require('bcrypt');
    await prisma.user.create({
      data: {
        email, name: 'Admin', role: 'ADMIN',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    return res.body.accessToken;
  }

  async function seedShopper() {
    counter += 1;
    const email = `refunds-shopper-${counter}@test.com`;
    const bcrypt = require('bcrypt');
    const user = await prisma.user.create({
      data: {
        email, name: 'Shopper', role: 'CUSTOMER',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    const addr = await prisma.address.create({
      data: { userId: user.id, line1: '1 St', city: 'X', state: 'X', postal: '00000' },
    });
    const product = await prisma.product.create({
      data: { name: 'X', description: '', priceCents: 1000, category: 'X', stock: 5 },
    });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    return { token: res.body.accessToken, userId: user.id, addressId: addr.id, productId: product.id };
  }

  async function makeDeliveredOrder(userId, addressId, productId) {
    const order = await prisma.order.create({
      data: {
        userId, addressId, totalCents: 1000, paymentMethod: 'CARD',
        status: 'DELIVERED',
        snapshotName: 'X', snapshotLine1: '1', snapshotCity: 'X', snapshotState: 'X', snapshotPostal: '00000',
        items: { create: [{ productId, quantity: 1, priceCents: 1000 }] },
        timeline: { create: [{ status: 'PLACED' }, { status: 'DELIVERED' }] },
      },
    });
    return order;
  }

  it('customer requests refund on DELIVERED order and admin approves it', async () => {
    const shopper = await seedShopper();
    const aTok = await seedAdmin();
    const order = await makeDeliveredOrder(shopper.userId, shopper.addressId, shopper.productId);

    const createRes = await request(app)
      .post('/api/refunds')
      .set('Authorization', `Bearer ${shopper.token}`)
      .send({ orderId: order.id, reason: 'Wrong item shipped' })
      .expect(201);
    assert.equal(createRes.body.refund.status, 'PENDING');
    assert.equal(createRes.body.refund.amountCents, 1000);

    await request(app)
      .post(`/api/refunds/${createRes.body.refund.id}/approve`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({})
      .expect(200);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    assert.equal(updated.status, 'REFUNDED');

    // Stock should be restored.
    const product = await prisma.product.findUnique({ where: { id: shopper.productId } });
    assert.equal(product.stock, 6); // was 5, +1 from the order
  });

  it('refund window enforced — request fails on order too old', async () => {
    const shopper = await seedShopper();
    const order = await makeDeliveredOrder(shopper.userId, shopper.addressId, shopper.productId);
    // Backdate updatedAt beyond 15 days.
    await prisma.order.update({
      where: { id: order.id },
      data: { updatedAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000) },
    });
    await request(app)
      .post('/api/refunds')
      .set('Authorization', `Bearer ${shopper.token}`)
      .send({ orderId: order.id, reason: 'Out of window' })
      .expect(400)
      .then((res) => assert.equal(res.body.error, 'REFUND_WINDOW_EXPIRED'));
  });

  it('blocks refund on non-delivered order', async () => {
    const shopper = await seedShopper();
    const order = await prisma.order.create({
      data: {
        userId: shopper.userId, addressId: shopper.addressId, totalCents: 1000,
        paymentMethod: 'CARD', status: 'SHIPPED',
        snapshotName: 'X', snapshotLine1: '1', snapshotCity: 'X', snapshotState: 'X', snapshotPostal: '00000',
        items: { create: [{ productId: shopper.productId, quantity: 1, priceCents: 1000 }] },
        timeline: { create: [{ status: 'PLACED' }] },
      },
    });
    await request(app)
      .post('/api/refunds')
      .set('Authorization', `Bearer ${shopper.token}`)
      .send({ orderId: order.id, reason: 'Too early' })
      .expect(400)
      .then((res) => assert.equal(res.body.error, 'ORDER_NOT_DELIVERED'));
  });

  it('cannot request refund on someone else\'s order', async () => {
    const shopper = await seedShopper();
    const otherShopper = await seedShopper();
    const order = await makeDeliveredOrder(shopper.userId, shopper.addressId, shopper.productId);
    await request(app)
      .post('/api/refunds')
      .set('Authorization', `Bearer ${otherShopper.token}`)
      .send({ orderId: order.id, reason: 'Hijack' })
      .expect(403);
  });

  it('admin cannot manually set order status to REFUNDED via PATCH', async () => {
    const aTok = await seedAdmin();
    const shopper = await seedShopper();
    const order = await makeDeliveredOrder(shopper.userId, shopper.addressId, shopper.productId);
    await request(app)
      .patch(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({ status: 'REFUNDED' })
      .expect(400)
      .then((res) => assert.equal(res.body.error, 'USE_REFUND_FLOW'));
  });
});