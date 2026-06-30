const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');

let app;

describe('Product Changes API', { concurrency: 1 }, () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  let counter = 0;
  async function seedAdmin() {
    counter += 1;
    const email = `changes-admin-${counter}@test.com`;
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

  async function seedVendor() {
    counter += 1;
    const email = `changes-vendor-${counter}@test.com`;
    const bcrypt = require('bcrypt');
    const user = await prisma.user.create({
      data: {
        email, name: 'Vendor', role: 'VENDOR',
        passwordHash: await bcrypt.hash('Password123!', 12),
        vendor: {
          create: { businessName: 'Vendor Co', phone: '+1-555-0000', status: 'APPROVED', approvedAt: new Date() },
        },
      },
      include: { vendor: true },
    });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    return { token: res.body.accessToken, vendorId: user.vendor.id };
  }

  it('vendor submits a CREATE change and admin approval publishes it', async () => {
    const vTok = (await seedVendor()).token;
    const aTok = await seedAdmin();

    const createRes = await request(app)
      .post('/api/product-changes')
      .set('Authorization', `Bearer ${vTok}`)
      .send({ action: 'CREATE', name: 'New Item', priceCents: 999, category: 'Home', stock: 10 })
      .expect(201);
    assert.equal(createRes.body.change.status, 'PENDING');
    const changeId = createRes.body.change.id;

    // Not yet visible publicly.
    let list = await request(app).get('/api/products').expect(200);
    assert.ok(!list.body.products.some((p) => p.name === 'New Item'));

    // Admin approves.
    const approveRes = await request(app)
      .post(`/api/product-changes/${changeId}/approve`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({})
      .expect(200);
    assert.equal(approveRes.body.change.status, 'APPROVED');

    list = await request(app).get('/api/products').expect(200);
    assert.ok(list.body.products.some((p) => p.name === 'New Item'));
  });

  it('admin rejection leaves live data untouched', async () => {
    const vTok = (await seedVendor()).token;
    const aTok = await seedAdmin();

    const createRes = await request(app)
      .post('/api/product-changes')
      .set('Authorization', `Bearer ${vTok}`)
      .send({ action: 'CREATE', name: 'Rejected Item', priceCents: 500, category: 'Toys', stock: 1 })
      .expect(201);

    await request(app)
      .post(`/api/product-changes/${createRes.body.change.id}/reject`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({ adminNote: 'Pricing below minimum.' })
      .expect(200);

    const list = await request(app).get('/api/products').expect(200);
    assert.ok(!list.body.products.some((p) => p.name === 'Rejected Item'));
  });

  it('vendor submission notifies every admin with a deep link to the pending queue', async () => {
    // Two admins so we confirm the fan-out hits all admins, not just the
    // first one. The seed is per-test, so this is a fresh DB.
    const a1Tok = await seedAdmin();
    const a2Tok = await seedAdmin();
    const vTok = (await seedVendor()).token;

    // Inbox baseline: each admin has whatever the helper left (none here).
    const before1 = await request(app).get('/api/notifications?unreadOnly=true').set('Authorization', `Bearer ${a1Tok}`).expect(200);
    const before2 = await request(app).get('/api/notifications?unreadOnly=true').set('Authorization', `Bearer ${a2Tok}`).expect(200);
    const base1 = before1.body.unreadCount;
    const base2 = before2.body.unreadCount;

    // Vendor submits.
    const createRes = await request(app)
      .post('/api/product-changes')
      .set('Authorization', `Bearer ${vTok}`)
      .send({ action: 'CREATE', name: 'Notified Item', priceCents: 1500, category: 'Home', stock: 4 })
      .expect(201);
    const changeId = createRes.body.change.id;

    // Both admins now have a fresh `product_change_submitted` row pointing
    // at the change. Unread count is incremented.
    const inbox1 = await request(app).get('/api/notifications?unreadOnly=true').set('Authorization', `Bearer ${a1Tok}`).expect(200);
    const inbox2 = await request(app).get('/api/notifications?unreadOnly=true').set('Authorization', `Bearer ${a2Tok}`).expect(200);
    assert.equal(inbox1.body.unreadCount, base1 + 1, 'admin 1 should have one new unread');
    assert.equal(inbox2.body.unreadCount, base2 + 1, 'admin 2 should have one new unread');

    const note1 = inbox1.body.notifications.find((n) => n.kind === 'product_change_submitted');
    assert.ok(note1, 'admin 1 inbox has a product_change_submitted row');
    assert.equal(note1.link, '/changes?status=PENDING', 'link targets the pre-filtered pending queue');
    // `meta` is a JSON column — the inbox endpoint returns it as a string,
    // so parse it before asserting. (Other inbox tests follow the same
    // pattern, see orders-cancel-track.test.js.)
    const note1Meta = JSON.parse(note1.meta || '{}');
    assert.equal(note1Meta.changeId, changeId, 'meta carries the change id for deep linking');
    assert.equal(note1Meta.action, 'CREATE');
    assert.match(note1.title, /submitted a new product: Notified Item/);

    // The other admin sees the same row.
    const note2 = inbox2.body.notifications.find((n) => n.kind === 'product_change_submitted');
    assert.ok(note2);
    assert.equal(note2.link, '/changes?status=PENDING');
    const note2Meta = JSON.parse(note2.meta || '{}');
    assert.equal(note2Meta.changeId, changeId);
  });

  it('vendor UPDATE change does not mutate the live product until approved', async () => {
    const aTok = await seedAdmin();
    const vendor = await seedVendor();
    const vTok = vendor.token;

    // Seed a product owned by this vendor directly via Prisma (admin path).
    const product = await prisma.product.create({
      data: {
        vendorId: vendor.vendorId,
        name: 'Live Item',
        description: 'desc',
        priceCents: 1000,
        category: 'Home',
        stock: 10,
        status: 'LIVE',
      },
    });

    const patchRes = await request(app)
      .patch(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${vTok}`)
      .send({ priceCents: 800 })
      .expect(202);
    assert.equal(patchRes.body.change.action, 'UPDATE');
    assert.equal(patchRes.body.change.status, 'PENDING');

    // Public product still at old price.
    const before = await request(app).get(`/api/products/${product.id}`).expect(200);
    assert.equal(before.body.product.priceCents, 1000);

    await request(app)
      .post(`/api/product-changes/${patchRes.body.change.id}/approve`)
      .set('Authorization', `Bearer ${aTok}`)
      .send({})
      .expect(200);

    const after = await request(app).get(`/api/products/${product.id}`).expect(200);
    assert.equal(after.body.product.priceCents, 800);
  });

  it('non-admin cannot approve a change', async () => {
    const vTok = (await seedVendor()).token;
    const createRes = await request(app)
      .post('/api/product-changes')
      .set('Authorization', `Bearer ${vTok}`)
      .send({ action: 'CREATE', name: 'Forbidden Item', priceCents: 100, category: 'Home', stock: 1 })
      .expect(201);
    await request(app)
      .post(`/api/product-changes/${createRes.body.change.id}/approve`)
      .set('Authorization', `Bearer ${vTok}`)
      .send({})
      .expect(403);
  });
});