const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');

let app;

describe('Mobile Money API', () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  let buyerCount = 0;

  async function seedCustomerWithCartAndAddress() {
    buyerCount += 1;
    const email = `mm-buyer-${buyerCount}@test.com`;
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

  it('saves a mobile-money payment method with masked phone', async () => {
    const { token } = await seedCustomerWithCartAndAddress();
    const res = await request(app)
      .post('/api/payments/mobile-money/methods')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'MPESA', phone: '254712345678', country: 'KE' })
      .expect(201);

    assert.equal(res.body.method.type, 'MOBILE_MONEY');
    assert.equal(res.body.method.mobileProvider, 'MPESA');
    assert.equal(res.body.method.mobileNumber, '********5678');
    assert.equal(res.body.method.mobileCountry, 'KE');
  });

  it('places an order with mobile money and creates a pending txn', async () => {
    const { token, addressId } = await seedCustomerWithCartAndAddress();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        addressId,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoney: { provider: 'MPESA', phone: '254712345678', country: 'KE' },
      })
      .expect(201);

    assert.equal(res.body.order.status, 'PLACED');
    assert.equal(res.body.payment.method, 'MOBILE_MONEY');
    assert.equal(res.body.payment.status, 'PENDING');
    assert.ok(res.body.payment.maskedPhone);

    const txn = await prisma.mobileMoneyTxn.findFirst({
      where: { orderId: res.body.order.id },
    });
    assert.ok(txn);
    assert.equal(txn.status, 'PENDING');
    assert.equal(txn.provider, 'MPESA');
    assert.equal(txn.maskedPhone, '********5678');
  });

  it('accepts Mali mobile-money providers like MobiCash and Orange Money', async () => {
    const providers = ['MOBICASH', 'ORANGE_MONEY'];
    for (const provider of providers) {
      const payload = {
        addressId: 'address_123',
        paymentMethod: 'MOBILE_MONEY',
        mobileMoney: {
          provider,
          phone: '66700000',
          country: 'ML',
        },
      };

      const parsed = await (async () => {
        const { orderCreate } = require('../src/lib/validators');
        return orderCreate.parse(payload);
      })();

      assert.equal(parsed.mobileMoney.provider, provider);
      assert.equal(parsed.mobileMoney.country, 'ML');
    }
  });

  it('rejects mobile-money order without details', async () => {
    const { token, addressId } = await seedCustomerWithCartAndAddress();
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId, paymentMethod: 'MOBILE_MONEY' })
      .expect(400);
  });

  it('simulated provider callback updates order to PAID', async () => {
    const { token, addressId } = await seedCustomerWithCartAndAddress();
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        addressId,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoney: { provider: 'MTN', phone: '233201234567', country: 'GH' },
      })
      .expect(201);

    const providerTxnId = orderRes.body.payment.txnId;
    assert.ok(providerTxnId);

    await request(app)
      .post('/api/payments/mobile-money/callback')
      .set('X-Provider-Signature', 'dev')
      .send({ providerTxnId, status: 'SUCCESS' })
      .expect(200);

    const order = await prisma.order.findUnique({ where: { id: orderRes.body.order.id } });
    assert.equal(order.status, 'PAID');

    const txn = await prisma.mobileMoneyTxn.findFirst({ where: { providerTxnId } });
    assert.equal(txn.status, 'SUCCESS');
  });

  it('rejects callback with invalid signature', async () => {
    const { token, addressId } = await seedCustomerWithCartAndAddress();
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        addressId,
        paymentMethod: 'MOBILE_MONEY',
        mobileMoney: { provider: 'MTN', phone: '233201234567', country: 'GH' },
      })
      .expect(201);

    const providerTxnId = orderRes.body.payment.txnId;
    await request(app)
      .post('/api/payments/mobile-money/callback')
      .set('X-Provider-Signature', 'bad-signature')
      .send({ providerTxnId, status: 'SUCCESS' })
      .expect(403);
  });
});
