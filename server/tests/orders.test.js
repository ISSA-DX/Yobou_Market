const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');

let app;

describe('Orders API', () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  let buyerCount = 0;

  async function seedCustomerWithCartAndAddress() {
    buyerCount += 1;
    const email = `buyer-${buyerCount}@test.com`;
    const bcrypt = require('bcrypt');
    const user = await prisma.user.create({
      data: {
        email,
        name: 'Buyer',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
        addresses: {
          create: {
            line1: '123 Test St',
            city: 'Testville',
            state: 'TS',
            postal: '12345',
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password123!' });

    const token = login.body.accessToken;
    const product = await prisma.product.create({
      data: {
        name: 'Orderable Product',
        description: 'A test product',
        priceCents: 1500,
        category: 'Home',
        stock: 10,
        status: 'LIVE',
        imageUrls: JSON.stringify(['/seed-images/home.svg']),
      },
    });

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 })
      .expect(201);

    return { token, userId: user.id, addressId: user.addresses[0].id, productId: product.id };
  }

  it('places an order and decrements stock', async () => {
    const { token, addressId } = await seedCustomerWithCartAndAddress();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId, paymentMethod: 'COD' })
      .expect(201);
    assert.equal(res.body.order.status, 'PLACED');
    assert.ok(res.body.order.items.length > 0);

    const product = await prisma.product.findUnique({ where: { id: res.body.order.items[0].productId } });
    assert.equal(product.stock, 8); // 10 - 2
  });

  it('rejects order with invalid address', async () => {
    const { token } = await seedCustomerWithCartAndAddress();
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId: 'nonexistent', paymentMethod: 'COD' })
      .expect(400);
  });

  it('rejects order when stock is insufficient', async () => {
    const { token, userId, addressId } = await seedCustomerWithCartAndAddress();
    await prisma.cartItem.updateMany({
      where: { userId },
      data: { quantity: 100 },
    });
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId, paymentMethod: 'COD' })
      .expect(400);
  });
});
