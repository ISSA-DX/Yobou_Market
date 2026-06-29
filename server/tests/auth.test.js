const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { getApp, resetTestDb, prisma, signAccessFor } = require('./helper');

let app;

async function makeUser(role, extras = {}) {
  const passwordHash = await bcrypt.hash('Password123!', 4);
  return prisma.user.create({
    data: {
      email: extras.email || `${role}-${Date.now()}-${Math.random()}@example.com`,
      name: extras.name || `${role} User`,
      passwordHash,
      role,
      ...(extras.vendor && { vendor: { create: extras.vendor } }),
    },
    include: { vendor: true },
  });
}

describe('Auth API', () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  it('registers a new customer', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'Password123!' })
      .expect(201);
    assert.equal(res.body.user.email, 'test@example.com');
    assert.equal(res.body.user.role, 'CUSTOMER');
    assert.ok(res.body.accessToken);
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'dup@example.com', password: 'Password123!' })
      .expect(201);
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Other', email: 'dup@example.com', password: 'Password123!' })
      .expect(409);
  });

  it('logs in with valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Login User', email: 'login@example.com', password: 'Password123!' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'Password123!' })
      .expect(200);
    assert.equal(res.body.user.email, 'login@example.com');
    assert.ok(res.headers['set-cookie']);
  });

  it('rejects invalid credentials', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope@example.com', password: 'Password123!' })
      .expect(401);
  });

  it('allows PENDING vendors to log in to see their status page', async () => {
    await request(app)
      .post('/api/vendors/register')
      .send({
        name: 'Pending Vendor',
        email: 'pending@example.com',
        password: 'Password123!',
        businessName: 'Pending Co',
        phone: '+1-555-0000',
      });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'pending@example.com', password: 'Password123!' })
      .expect(200);
    assert.equal(res.body.user.role, 'VENDOR');
    assert.equal(res.body.user.vendor.status, 'PENDING');
  });

  it('blocks REJECTED vendors from logging in', async () => {
    // Use direct DB + signAccessFor to flip the vendor to REJECTED.
    // This avoids the test needing an admin user in the seed.
    const vendor = await prisma.vendor.create({
      data: {
        user: {
          create: {
            email: 'rejected@example.com',
            name: 'Rejected Vendor',
            passwordHash: await bcrypt.hash('Password123!', 4),
            role: 'VENDOR',
          },
        },
        businessName: 'Rejected Co',
        phone: '+1-555-0001',
        categories: '[]',
        status: 'REJECTED',
      },
      include: { user: true },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rejected@example.com', password: 'Password123!' })
      .expect(403);
    assert.equal(res.body.error, 'VENDOR_REJECTED');
    // Sanity-check the user is actually in the DB.
    const found = await prisma.user.findUnique({ where: { id: vendor.user.id } });
    assert.ok(found);
  });
});