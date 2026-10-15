// Session stability: POST /api/auth/guest must never replace a live
// session, and signing in / registering carries a GUEST's cart and
// addresses into the account — but never another real account's.
const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, getApp } = require('./helper');

// Pull the refresh cookie out of a response so the next request can
// present it, like a browser would.
function cookieFrom(res) {
  const raw = [].concat(res.headers['set-cookie'] || []).find((c) => c.startsWith('yobou_rt='));
  return raw ? raw.split(';')[0] : null;
}

async function makeProduct() {
  return prisma.product.create({
    data: { name: 'Earbuds', description: '', priceCents: 1000, stock: 10, category: 'Electronics', status: 'LIVE' },
  });
}

test('guest — a second call with the session cookie resumes the same guest', async () => {
  await resetTestDb();
  const app = getApp();
  const first = await request(app, 'POST', '/api/auth/guest');
  assert.strictEqual(first.status, 201, JSON.stringify(first.body));
  assert.strictEqual(first.body.user.isGuest, true);
  const cookie = cookieFrom(first);
  assert.ok(cookie, 'guest should get a refresh cookie');

  const again = await request(app, 'POST', '/api/auth/guest', { headers: { Cookie: cookie } });
  assert.strictEqual(again.status, 200, JSON.stringify(again.body));
  assert.strictEqual(again.body.resumed, true);
  assert.strictEqual(again.body.user.id, first.body.user.id, 'must not mint a new guest');
  assert.strictEqual(await prisma.user.count(), 1);
});

test('guest — never downgrades a signed-in customer to a new guest', async () => {
  await resetTestDb();
  const app = getApp();
  const reg = await request(app, 'POST', '/api/auth/register', {
    body: { email: 'ada@example.com', password: 'Password123!', name: 'Ada' },
  });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
  assert.strictEqual(reg.body.user.isGuest, false);

  const res = await request(app, 'POST', '/api/auth/guest', { headers: { Cookie: cookieFrom(reg) } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.user.email, 'ada@example.com');
});

test('guest — without a cookie (or with a bad one) a new guest is created', async () => {
  await resetTestDb();
  const app = getApp();
  const res = await request(app, 'POST', '/api/auth/guest', { headers: { Cookie: 'yobou_rt=not-a-token' } });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.user.isGuest, true);
});

test('register — carries the guest cart and addresses into the new account', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct();
  const guest = await request(app, 'POST', '/api/auth/guest');
  const guestId = guest.body.user.id;
  await prisma.cartItem.create({ data: { userId: guestId, productId: product.id, quantity: 2 } });
  await prisma.address.create({ data: { userId: guestId, line1: 'Rue 123', city: 'Bamako', state: 'Bamako', postal: '', isDefault: true } });

  const reg = await request(app, 'POST', '/api/auth/register', {
    headers: { Cookie: cookieFrom(guest) },
    body: { email: 'new@example.com', password: 'Password123!', name: 'New' },
  });
  assert.strictEqual(reg.status, 201, JSON.stringify(reg.body));
  const userId = reg.body.user.id;
  const cart = await prisma.cartItem.findMany({ where: { userId } });
  assert.deepStrictEqual(cart.map((c) => c.quantity), [2]);
  assert.strictEqual(await prisma.address.count({ where: { userId } }), 1);
  assert.strictEqual(await prisma.cartItem.count({ where: { userId: guestId } }), 0);
});

test('login — merges a guest cart but never another real account’s cart', async () => {
  await resetTestDb();
  const app = getApp();
  const product = await makeProduct();
  const a = await request(app, 'POST', '/api/auth/register', { body: { email: 'a@example.com', password: 'Password123!', name: 'A' } });
  await request(app, 'POST', '/api/auth/register', { body: { email: 'b@example.com', password: 'Password123!', name: 'B' } });
  await prisma.cartItem.create({ data: { userId: a.body.user.id, productId: product.id, quantity: 1 } });

  // B signs in on a phone where A's session cookie is still present.
  const login = await request(app, 'POST', '/api/auth/login', {
    headers: { Cookie: cookieFrom(a) },
    body: { email: 'b@example.com', password: 'Password123!' },
  });
  assert.strictEqual(login.status, 200, JSON.stringify(login.body));
  assert.strictEqual(await prisma.cartItem.count({ where: { userId: login.body.user.id } }), 0, 'B must not receive A’s cart');
  assert.strictEqual(await prisma.cartItem.count({ where: { userId: a.body.user.id } }), 1, 'A keeps their cart');
});
