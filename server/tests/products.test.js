const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');

let app;

describe('Products API', { concurrency: 1 }, () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  let adminCount = 0;
  let vendorCount = 0;

  async function seedAdmin() {
    adminCount += 1;
    const email = `admin-${adminCount}@test.com`;
    const bcrypt = require('bcrypt');
    await prisma.user.create({
      data: {
        email,
        name: 'Admin',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'ADMIN',
      },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' });
    return res.body.accessToken;
  }

  async function seedVendor(status = 'APPROVED') {
    vendorCount += 1;
    const email = `vendor-${status.toLowerCase()}-${vendorCount}@test.com`;
    const bcrypt = require('bcrypt');
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Vendor',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'VENDOR',
        vendor: {
          create: {
            businessName: 'Vendor Co',
            phone: '+1-555-0000',
            status,
            approvedAt: status === 'APPROVED' ? new Date() : null,
          },
        },
      },
      include: { vendor: true },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' });
    return { token: res.body.accessToken, vendorId: user.vendor.id };
  }

  it('lists public products', async () => {
    const token = await seedAdmin();
    await request(app)
      .post('/api/products/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Public Product', description: 'Test', priceCents: 1000, category: 'Electronics', stock: 10 })
      .expect(201);
    const res = await request(app).get('/api/products').expect(200);
    assert.ok(res.body.products.some((p) => p.name === 'Public Product'));
    assert.ok(!res.body.products.some((p) => p.name === 'Draft Product'));
  });

  it('hides draft products from public view', async () => {
    const token = await seedAdmin();
    const { body: { product } } = await request(app)
      .post('/api/products/admin')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Draft Product', priceCents: 1000, category: 'Electronics', stock: 10, status: 'DRAFT' });
    await request(app).get(`/api/products/${product.id}`).expect(404);
  });

  it('queues vendor product create as a PENDING change', async () => {
    const { token } = await seedVendor('APPROVED');
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Vendor Product', priceCents: 2000, category: 'Fashion', stock: 5 })
      .expect(201);
    assert.equal(res.body.change.action, 'CREATE');
    assert.equal(res.body.change.status, 'PENDING');
    assert.equal(res.body.change.proposedName, 'Vendor Product');
    // Public listing should not see it until admin approves.
    const list = await request(app).get('/api/products').expect(200);
    assert.ok(!list.body.products.some((p) => p.name === 'Vendor Product'));
  });

  it('blocks pending vendors from creating products', async () => {
    const { token, vendorId } = await seedVendor('APPROVED');
    await prisma.vendor.update({ where: { id: vendorId }, data: { status: 'PENDING' } });
    await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad Product', priceCents: 1000, category: 'Fashion', stock: 5 })
      .expect(403);
  });

  it('vendor quick stock edit queues a ProductChange with only proposedStock set', async () => {
    const { token, vendorId } = await seedVendor('APPROVED');
    // Create a LIVE product owned by this vendor.
    const product = await prisma.product.create({
      data: {
        vendorId,
        name: 'Stockable',
        description: '',
        priceCents: 500,
        category: 'X',
        imageUrls: '[]',
        stock: 10,
        status: 'LIVE',
      },
    });

    const res = await request(app)
      .patch(`/api/products/vendor/${product.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: 25 })
      .expect(202);
    assert.equal(res.body.change.action, 'UPDATE');
    assert.equal(res.body.change.status, 'PENDING');
    assert.equal(res.body.change.proposedStock, 25);
    // Other proposed* fields must be null so admin only flips stock.
    assert.equal(res.body.change.proposedName, null);
    assert.equal(res.body.change.proposedPriceCents, null);

    // Live product stock must NOT change until admin approves.
    const live = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(live.stock, 10);
  });

  it('vendor quick stock edit forbids editing another vendor\'s product', async () => {
    const { token, vendorId } = await seedVendor('APPROVED');
    const other = await prisma.product.create({
      data: {
        name: 'Other Vendor Product',
        description: '',
        priceCents: 100,
        category: 'X',
        imageUrls: '[]',
        stock: 5,
        status: 'LIVE',
        vendorId: null, // admin-owned
      },
    });
    await request(app)
      .patch(`/api/products/vendor/${other.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: 99 })
      .expect(403);
  });

  it('vendor quick stock edit rejects negative stock', async () => {
    const { token, vendorId } = await seedVendor('APPROVED');
    const product = await prisma.product.create({
      data: {
        vendorId,
        name: 'Negative Stock Test',
        description: '',
        priceCents: 100,
        category: 'X',
        imageUrls: '[]',
        stock: 5,
        status: 'LIVE',
      },
    });
    await request(app)
      .patch(`/api/products/vendor/${product.id}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stock: -1 })
      .expect(400);
  });
});
