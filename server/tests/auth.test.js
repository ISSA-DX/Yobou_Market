const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp, resetTestDb } = require('./helper');

let app;

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

  it('blocks pending vendors from logging in', async () => {
    await request(app)
      .post('/api/vendors/register')
      .send({
        name: 'Pending Vendor',
        email: 'pending@example.com',
        password: 'Password123!',
        businessName: 'Pending Co',
        phone: '+1-555-0000',
      });
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'pending@example.com', password: 'Password123!' })
      .expect(403);
  });
});
