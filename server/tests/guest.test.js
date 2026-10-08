const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');

let app;

describe('Guest auth + cart merge on login', { concurrency: 1 }, () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  it('mints a silent guest user via POST /api/auth/guest', async () => {
    const res = await request(app).post('/api/auth/guest').expect(201);
    assert.equal(res.body.isGuest, true);
    assert.ok(res.body.accessToken, 'accessToken should be present');
    assert.ok(res.body.user, 'user should be present');
    assert.equal(res.body.user.role, 'CUSTOMER');
    assert.match(res.body.user.email, /^guest-[0-9a-f]+@guest\.local$/);
    // The access token from the response works on /api/auth/me.
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, res.body.user.id);
  });

  it('guest can /api/cart add + GET after /auth/guest (server-side user is real)', async () => {
    const guest = await request(app).post('/api/auth/guest').expect(201);
    const token = guest.body.accessToken;
    const product = await prisma.product.create({
      data: {
        name: 'Guest Orderable',
        description: 'A test product',
        priceCents: 1500,
        category: 'Home',
        stock: 5,
        status: 'LIVE',
        imageUrls: JSON.stringify(['/seed-images/home.svg']),
      },
    });
    const add = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 })
      .expect(201);
    assert.equal(add.body.item.quantity, 2);
    assert.equal(add.body.item.userId || add.body.item.user?.id, guest.body.user.id);
    const list = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].quantity, 2);
  });

  it('merges guest cart into a freshly-logged-in real user', async () => {
    // One supertest agent for the whole test so cookies flow naturally
    // across the /guest -> /cart -> /login -> /cart sequence. This is
    // the canonical supertest pattern; manually splitting Set-Cookie
    // headers and re-injecting into a separate agent's jar is fragile
    // because the cookie path/domain constraints differ.
    const agent = request.agent(app);
    const guestRes = await agent.post('/api/auth/guest').expect(201);
    const guestToken = guestRes.body.accessToken;
    const product = await prisma.product.create({
      data: {
        name: 'Merge Tester',
        description: 'd',
        priceCents: 900,
        category: 'Home',
        stock: 9,
        status: 'LIVE',
        imageUrls: JSON.stringify(['/seed-images/home.svg']),
      },
    });
    await agent
      .post('/api/cart')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ productId: product.id, quantity: 3 })
      .expect(201);
    // Sanity (still via the agent): guest cart has the item.
    const before = await agent
      .get('/api/cart').set('Authorization', `Bearer ${guestToken}`).expect(200);
    assert.equal(before.body.items.length, 1);

    // Register a real customer separate from the guest. /login will
    // see the agent's cookie jar carrying the guest refresh cookie and
    // merge the guest's cart into the freshly-logged-in user.
    const realEmail = `customer-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email: realEmail,
        name: 'Real',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    const login = await agent
      .post('/api/auth/login').send({ email: realEmail, password: 'Password123!' }).expect(200);
    const realToken = login.body.accessToken;

    // Real user's cart now contains the guest's item.
    const after = await agent
      .get('/api/cart').set('Authorization', `Bearer ${realToken}`).expect(200);
    assert.equal(after.body.items.length, 1, 'merged cart should contain 1 row');
    assert.equal(after.body.items[0].quantity, 3);

    // Guest's cart is drained of that product.
    const ghost = await agent
      .get('/api/cart').set('Authorization', `Bearer ${guestToken}`).expect(200);
    assert.equal(ghost.body.items.length, 0, 'guest cart should be drained after merge');
  });

  it('does NOT merge when login user is the same as the cookie user', async () => {
    // Create a real user + log in to seed a refresh cookie WITHOUT
    // a guest in the cookie jar. Then add a cart item. Log in again.
    // Cart row count should not change.
    const email = `self-login-${Date.now()}@test.com`;
    const password = 'Password123!';
    await prisma.user.create({
      data: {
        email,
        name: 'Self',
        passwordHash: await bcrypt.hash(password, 12),
        role: 'CUSTOMER',
      },
    });
    const login1 = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    const token = login1.body.accessToken;
    const product = await prisma.product.create({
      data: {
        name: 'Self Login Tester',
        description: 'd',
        priceCents: 200,
        category: 'Home',
        stock: 3,
        status: 'LIVE',
        imageUrls: JSON.stringify(['/seed-images/home.svg']),
      },
    });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: product.id, quantity: 2 }).expect(201);
    const login2 = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
    const token2 = login2.body.accessToken;
    const after = await request(app).get('/api/cart').set('Authorization', `Bearer ${token2}`).expect(200);
    assert.equal(after.body.items.length, 1);
    assert.equal(after.body.items[0].quantity, 2);
  });

  it('does NOT merge cart-of-empty from a guest cookie (just clears the cookie on next refresh)', async () => {
    // Use one agent from the start so the guest refresh cookie flows
    // into the subsequent /login request via the agent's cookie jar.
    const agent = request.agent(app);
    await agent.post('/api/auth/guest').expect(201);
    const email = `nomerg-empty-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email,
        name: 'N',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    const login = await agent
      .post('/api/auth/login').send({ email, password: 'Password123!' }).expect(200);
    const token = login.body.accessToken;
    const after = await agent.get('/api/cart').set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(after.body.items.length, 0);
  });
});
