const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');
const stripeLib = require('../src/lib/stripe');

let app;
let originalStripeKey;

describe('Stripe scaffold', { concurrency: 1 }, () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
    // Snapshot env so we can restore at end of file (node:test doesn't
    // isolate env between tests, and one test sets the key).
    originalStripeKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('isStripeConfigured() returns false when STRIPE_SECRET_KEY is unset', () => {
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(stripeLib.isStripeConfigured(), false);
  });

  it('isStripeConfigured() returns true when STRIPE_SECRET_KEY is set', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_config_check_v1';
    assert.equal(stripeLib.isStripeConfigured(), true);
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('createPaymentIntent rejects with STRIPE_NOT_CONFIGURED when no key', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await assert.rejects(
      () => stripeLib.createPaymentIntent({ amountCents: 1000, currency: 'usd', metadata: {} }),
      (err) => err.code === 'STRIPE_NOT_CONFIGURED'
    );
  });

  it('/api/payments/intent responds 503 STRIPE_NOT_CONFIGURED when no key', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    app = getApp(); // re-pick up env
    // Need a logged-in user + an order to formulate the request body.
    const email = `stripe-test-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email,
        name: 'Tester',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    const login = await require('supertest')(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    const token = login.body.accessToken;
    const me = await require('supertest')(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const address = await prisma.address.create({
      data: {
        userId: me.body.user.id,
        line1: '1 Test St',
        city: 'TC',
        state: 'CA',
        postal: '94000',
          isDefault: true,
      },
    });
    // Admin to seed a product.
    const adminEmail = `stripe-admin-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Admin',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'ADMIN',
      },
    });
    const adminLogin = await require('supertest')(app).post('/api/auth/login').send({ email: adminEmail, password: 'Password123!' });
    const seededProduct = await require('supertest')(app)
      .post('/api/products/admin')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({ name: 'Stripe Test Product', priceCents: 1000, category: 'Tools', stock: 5 })
      .expect(201);
    // /api/orders drains the current cart — put one item in it first
    // so the create returns 201 instead of 400 CART_EMPTY.
    await require('supertest')(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: seededProduct.body.product.id, quantity: 1 })
      .expect(201);
    // Create the order via the simulator path.
    const orderRes = await require('supertest')(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId: address.id, paymentMethod: 'COD' })
      .expect(201);
    // Order is now PAID (COD auto-succeeds). Force back to PLACED so we
    // can test the /intent endpoint's PLACED precondition.
    await prisma.order.update({ where: { id: orderRes.body.order.id }, data: { status: 'PLACED' } });
    const intent = await require('supertest')(app)
      .post('/api/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: orderRes.body.order.id })
      .expect(503);
    assert.equal(intent.body.error, 'STRIPE_NOT_CONFIGURED');
  });

  it('/api/payments/intent 404s when order does not exist', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    app = getApp();
    const email = `stripe-404-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email,
        name: 'Tester',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    const login = await require('supertest')(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    const token = login.body.accessToken;
    const res = await require('supertest')(app)
      .post('/api/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: 'order_that_does_not_exist_zzz' })
      .expect(404);
    assert.equal(res.body.error, 'NOT_FOUND');
  });

  it('/api/payments/intent 403s when order belongs to another user', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    app = getApp();
    // Create two users + a product + an order by user A; user B tries /intent.
    const ownerEmail = `stripe-owner-${Date.now()}@test.com`;
    const attackerEmail = `stripe-attacker-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email: ownerEmail, name: 'Owner',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    await prisma.user.create({
      data: {
        email: attackerEmail, name: 'Attacker',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    const ownerLogin = await require('supertest')(app).post('/api/auth/login').send({ email: ownerEmail, password: 'Password123!' });
    const attackerLogin = await require('supertest')(app).post('/api/auth/login').send({ email: attackerEmail, password: 'Password123!' });
    const ownerMe = await require('supertest')(app).get('/api/auth/me').set('Authorization', `Bearer ${ownerLogin.body.accessToken}`);
    const address = await prisma.address.create({
      data: { userId: ownerMe.body.user.id, line1: '1 Test St', city: 'TC', state: 'CA', postal: '94000', isDefault: true },
    });
    const adminEmail = `stripe-admin2-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email: adminEmail, name: 'Admin',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'ADMIN',
      },
    });
    const adminLogin = await require('supertest')(app).post('/api/auth/login').send({ email: adminEmail, password: 'Password123!' });
    const productRes = await require('supertest')(app).post('/api/products/admin').set('Authorization', `Bearer ${adminLogin.body.accessToken}`).send({ name: 'P', priceCents: 1000, category: 'T', stock: 5 }).expect(201);
    await require('supertest')(app).post('/api/cart').set('Authorization', `Bearer ${ownerLogin.body.accessToken}`).send({ productId: productRes.body.product.id, quantity: 1 }).expect(201);
    const ord = await require('supertest')(app)
      .post('/api/orders').set('Authorization', `Bearer ${ownerLogin.body.accessToken}`)
      .send({ addressId: address.id, paymentMethod: 'COD' }).expect(201);
    const res = await require('supertest')(app)
      .post('/api/payments/intent')
      .set('Authorization', `Bearer ${attackerLogin.body.accessToken}`)
      .send({ orderId: ord.body.order.id })
      .expect(403);
    assert.equal(res.body.error, 'FORBIDDEN');
  });

  it('/api/payments/intent 409s when order is not PLACED', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    app = getApp();
    const email = `stripe-conflict-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email,
        name: 'Tester',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    const login = await require('supertest')(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    const token = login.body.accessToken;
    const me = await require('supertest')(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    const address = await prisma.address.create({
      data: { userId: me.body.user.id, line1: '1 Test St', city: 'TC', state: 'CA', postal: '94000', isDefault: true },
    });
    const adminEmail = `stripe-admin3-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email: adminEmail, name: 'Admin',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'ADMIN',
      },
    });
    const adminLogin = await require('supertest')(app).post('/api/auth/login').send({ email: adminEmail, password: 'Password123!' });
    const productRes = await require('supertest')(app).post('/api/products/admin').set('Authorization', `Bearer ${adminLogin.body.accessToken}`).send({ name: 'P', priceCents: 1000, category: 'T', stock: 5 }).expect(201);
    await require('supertest')(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: productRes.body.product.id, quantity: 1 }).expect(201);
    const ord = await require('supertest')(app)
      .post('/api/orders').set('Authorization', `Bearer ${token}`)
      .send({ addressId: address.id, paymentMethod: 'COD' }).expect(201);
    // Move past PLACED.
    await prisma.order.update({ where: { id: ord.body.order.id }, data: { status: 'CANCELLED' } });
    const res = await require('supertest')(app)
      .post('/api/payments/intent')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: ord.body.order.id })
      .expect(409);
    assert.equal(res.body.error, 'INVALID_STATE');
  });

  // Restore env to original (node:test doesn't auto-clean env).
  // Note: this is a courtesy; subsequent tests in other files might
  // be affected — keep them mind that env state leaks between suites.
  it('restores env', () => {
    if (originalStripeKey) process.env.STRIPE_SECRET_KEY = originalStripeKey;
    else delete process.env.STRIPE_SECRET_KEY;
  });
});
