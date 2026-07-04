// Cart selection — "pick which items to buy now, save the rest for later"
// Amazon-style behavior. We test the new CartItem.selectedForCheckout
// column end-to-end: per-item toggle, bulk select-all, ordering behavior.
//
// All tests follow the existing pattern (getApp() once, resetTestDb once,
// seed users + products via Prisma directly so the test isn't bottlenecked
// on the slow admin/product seed endpoints).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');
const { signAccess } = require('../src/auth/jwt');

let app;

describe('Cart selection for checkout', { concurrency: 1 }, () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  // ─── helpers ────────────────────────────────────────────────────────

  let userSerial = 0;
  async function makeUser({ name = 'Shopper' } = {}) {
    userSerial += 1;
    const user = await prisma.user.create({
      data: {
        email: `select-${Date.now()}-${userSerial}@test.com`,
        name,
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    return { user, token: signAccess(user) };
  }

  async function makeProduct({ name = 'P', priceCents = 1500, stock = 10 } = {}) {
    return prisma.product.create({
      data: {
        name,
        description: 'd',
        priceCents,
        category: 'Home',
        stock,
        status: 'LIVE',
        imageUrls: JSON.stringify(['/seed-images/home.svg']),
      },
    });
  }

  async function makeAddress(userId) {
    return prisma.address.create({
      data: {
        userId,
        line1: '1 Test St',
        city: 'T',
        state: 'TS',
        postal: '12345',
        isDefault: true,
      },
    });
  }

  // ─── POST /api/cart default to selected=true ────────────────────────

  it('POST /api/cart sets selectedForCheckout=true on a brand-new row', async () => {
    const { token } = await makeUser();
    const p = await makeProduct();
    const add = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: p.id, quantity: 2 })
      .expect(201);
    assert.equal(add.body.item.selectedForCheckout, true);

    // GET reflects it.
    const list = await request(app)
      .get('/api/cart').set('Authorization', `Bearer ${token}`).expect(200);
    assert.equal(list.body.items[0].selectedForCheckout, true);
  });

  it('POST /api/cart keeps the existing selected flag when incrementing the quantity (no silent flip)', async () => {
    const { token } = await makeUser();
    const p = await makeProduct();
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, quantity: 1 }).expect(201);
    // User unchecks.
    const cartItemId = (await prisma.cartItem.findFirst({ where: { productId: p.id } })).id;
    await request(app).patch(`/api/cart/items/${cartItemId}`).set('Authorization', `Bearer ${token}`).send({ selected: false }).expect(200);
    // Bumping qty from the cart should NOT re-select the row.
    await request(app).patch(`/api/cart/${p.id}`).set('Authorization', `Bearer ${token}`).send({ quantity: 3 }).expect(200);
    const after = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
    assert.equal(after.quantity, 3);
    assert.equal(after.selectedForCheckout, false, 'uncheck decision must survive a qty change');
  });

  // ─── PATCH /api/cart/items/:cartItemId toggle ───────────────────────

  it('PATCH /api/cart/items/:id toggles the flag and returns the updated row', async () => {
    const { token } = await makeUser();
    const p = await makeProduct();
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, quantity: 1 }).expect(201);
    const cartItemId = (await prisma.cartItem.findFirst({ where: { productId: p.id } })).id;
    const off = await request(app)
      .patch(`/api/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ selected: false })
      .expect(200);
    assert.equal(off.body.item.selectedForCheckout, false);
    const on = await request(app)
      .patch(`/api/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ selected: true })
      .expect(200);
    assert.equal(on.body.item.selectedForCheckout, true);
  });

  it('PATCH /api/cart/items/:id returns 404 for another user\'s row', async () => {
    const a = await makeUser({ name: 'A' });
    const b = await makeUser({ name: 'B' });
    const p = await makeProduct();
    await request(app).post('/api/cart').set('Authorization', `Bearer ${a.token}`).send({ productId: p.id, quantity: 1 }).expect(201);
    const cartItemId = (await prisma.cartItem.findFirst({ where: { productId: p.id } })).id;
    await request(app)
      .patch(`/api/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ selected: false })
      .expect(404);
  });

  it('PATCH /api/cart/items/:id returns 400 on a non-boolean body', async () => {
    const { token } = await makeUser();
    const p = await makeProduct();
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, quantity: 1 }).expect(201);
    const cartItemId = (await prisma.cartItem.findFirst({ where: { productId: p.id } })).id;
    await request(app)
      .patch(`/api/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ selected: 'yes' })
      .expect(400);
  });

  // ─── PATCH /api/cart/selection bulk ─────────────────────────────────

  it('PATCH /api/cart/selection bulk-false unselects every row', async () => {
    const { token } = await makeUser();
    const p1 = await makeProduct({ name: 'P1', priceCents: 800 });
    const p2 = await makeProduct({ name: 'P2', priceCents: 1200 });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p1.id, quantity: 1 }).expect(201);
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p2.id, quantity: 1 }).expect(201);
    const res = await request(app)
      .patch('/api/cart/selection')
      .set('Authorization', `Bearer ${token}`)
      .send({ selected: false })
      .expect(200);
    assert.equal(res.body.items.length, 2);
    for (const it of res.body.items) assert.equal(it.selectedForCheckout, false);
  });

  it('PATCH /api/cart/selection bulk-true re-selects every row', async () => {
    const { token } = await makeUser();
    const p1 = await makeProduct({ name: 'P1' });
    const p2 = await makeProduct({ name: 'P2' });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p1.id, quantity: 1 }).expect(201);
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p2.id, quantity: 1 }).expect(201);
    await request(app).patch('/api/cart/selection').set('Authorization', `Bearer ${token}`).send({ selected: false }).expect(200);
    const res = await request(app)
      .patch('/api/cart/selection')
      .set('Authorization', `Bearer ${token}`)
      .send({ selected: true })
      .expect(200);
    for (const it of res.body.items) assert.equal(it.selectedForCheckout, true);
  });

  // ─── POST /api/orders behavior with selection ───────────────────────

  it('POST /api/orders with 0 selected (cart not empty) returns 400 NO_SELECTION', async () => {
    const { token, user } = await makeUser();
    const addr = await makeAddress(user.id);
    const p = await makeProduct();
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p.id, quantity: 1 }).expect(201);
    await request(app).patch('/api/cart/selection').set('Authorization', `Bearer ${token}`).send({ selected: false }).expect(200);
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId: addr.id, paymentMethod: 'COD' })
      .expect(400);
    assert.equal(res.body.error, 'NO_SELECTION');
    assert.equal(res.body.totalCount, 1);
    // No order created, no cart wipe.
    const orders = await prisma.order.count({ where: { userId: user.id } });
    const cartRows = await prisma.cartItem.count({ where: { userId: user.id } });
    assert.equal(orders, 0);
    assert.equal(cartRows, 1);
  });

  it('POST /api/orders with mixed selection orders only the selected rows and leaves the rest in the cart', async () => {
    const { token, user } = await makeUser();
    const addr = await makeAddress(user.id);
    const p1 = await makeProduct({ name: 'SELECT_ME', priceCents: 2000, stock: 5 });
    const p2 = await makeProduct({ name: 'SAVE_FOR_LATER', priceCents: 900, stock: 5 });
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p1.id, quantity: 1 }).expect(201);
    await request(app).post('/api/cart').set('Authorization', `Bearer ${token}`).send({ productId: p2.id, quantity: 2 }).expect(201);
    // Deselect p2 only.
    const p2Cart = await prisma.cartItem.findFirst({ where: { productId: p2.id } });
    await request(app).patch(`/api/cart/items/${p2Cart.id}`).set('Authorization', `Bearer ${token}`).send({ selected: false }).expect(200);

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId: addr.id, paymentMethod: 'COD' })
      .expect(201);
    assert.equal(res.body.order.items.length, 1);
    assert.equal(res.body.order.items[0].productId, p1.id);
    assert.equal(res.body.order.subtotalCents, 2000);

    // p2 row stays in the cart, unchanged (qty 2, unselected).
    const remaining = await prisma.cartItem.findMany({ where: { userId: user.id } });
    assert.equal(remaining.length, 1, 'unselected rows stay in the cart after order');
    assert.equal(remaining[0].productId, p2.id);
    assert.equal(remaining[0].quantity, 2);
    assert.equal(remaining[0].selectedForCheckout, false);
  });

  it('POST /api/orders with empty cart returns 400 CART_EMPTY (not NO_SELECTION)', async () => {
    const { token, user } = await makeUser();
    const addr = await makeAddress(user.id);
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressId: addr.id, paymentMethod: 'COD' })
      .expect(400);
    assert.equal(res.body.error, 'CART_EMPTY');
    assert.equal(res.body.totalCount, 0);
  });

  // ─── guest-login merge preserves selection intent ────────────────────

  it('transferGuestCart preserves the guest\'s selectedForCheckout flag on moved rows', async () => {
    // Guest adds 2 items, unchecks one, then logs in. The destination
    // cart row that was unchecked stays unchecked.
    const agent = request.agent(app);
    const guest = await agent.post('/api/auth/guest').expect(201);
    const guestToken = guest.body.accessToken;
    const p1 = await makeProduct({ name: 'GUEST_KEEP', priceCents: 500, stock: 3 });
    const p2 = await makeProduct({ name: 'GUEST_DROP', priceCents: 700, stock: 3 });
    await agent.post('/api/cart').set('Authorization', `Bearer ${guestToken}`).send({ productId: p1.id, quantity: 1 }).expect(201);
    await agent.post('/api/cart').set('Authorization', `Bearer ${guestToken}`).send({ productId: p2.id, quantity: 1 }).expect(201);
    const p2Guest = await prisma.cartItem.findFirst({ where: { productId: p2.id } });
    await agent.patch(`/api/cart/items/${p2Guest.id}`).set('Authorization', `Bearer ${guestToken}`).send({ selected: false }).expect(200);

    const realEmail = `merge-selection-${Date.now()}@test.com`;
    await prisma.user.create({
      data: {
        email: realEmail,
        name: 'Real',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'CUSTOMER',
      },
    });
    await agent.post('/api/auth/login').send({ email: realEmail, password: 'Password123!' }).expect(200);

    const rows = await prisma.cartItem.findMany({
      where: { product: { OR: [{ id: p1.id }, { id: p2.id }] } },
      orderBy: { productId: 'asc' },
    });
    const p1Row = rows.find((r) => r.productId === p1.id);
    const p2Row = rows.find((r) => r.productId === p2.id);
    assert.equal(p1Row.selectedForCheckout, true, 'guest-selected row stays selected after merge');
    assert.equal(p2Row.selectedForCheckout, false, 'guest-unchecked row stays unchecked after merge');
  });

  it('transferGuestCart does NOT silently flip a destination\'s saved-for-later row when the guest\'s copy was selected', async () => {
    // Regression guard for an earlier bug: transferGuestCart's update-
    // existing branch used `existing.selectedForCheckout ||
    // item.selectedForCheckout`, which silently flipped a real user's
    // saved-for-later row to selected whenever the guest's matching
    // row was checked. The fix wins with the destination's existing
    // flag — see auth/routes.js transferGuestCart.
    //
    // Build a sequence that exercises the merge-existing path:
    //   1. Real user A has product X in their cart, deliberately unchecked.
    //   2. A clears cookies.
    //   3. A logs in as a guest and adds X (selected-by-default).
    //   4. A logs back in as user A (with the guest refresh cookie
    //      still in the agent jar, so transferGuestCart fires).
    //   5. User A's existing row must STILL be unchecked.
    const agent = request.agent(app);
    const email = `dest-flag-wins-${Date.now()}@test.com`;
    const password = 'Password123!';
    await prisma.user.create({
      data: {
        email,
        name: 'Dest',
        passwordHash: await bcrypt.hash(password, 12),
        role: 'CUSTOMER',
      },
    });
    const realProduct = await makeProduct({ name: 'SHARED', priceCents: 1100, stock: 5 });
    const firstLogin = await agent
      .post('/api/auth/login').send({ email, password }).expect(200);
    const realToken = firstLogin.body.accessToken;
    await agent.post('/api/cart').set('Authorization', `Bearer ${realToken}`).send({ productId: realProduct.id, quantity: 2 }).expect(201);
    const realRow = await prisma.cartItem.findFirst({ where: { userId: firstLogin.body.user.id, productId: realProduct.id } });
    await agent.patch(`/api/cart/items/${realRow.id}`).set('Authorization', `Bearer ${realToken}`).send({ selected: false }).expect(200);

    // Log out (clears the refresh cookie via res.clearCookie), then
    // log in as a fresh guest on the same agent so cookies propagate.
    await agent.post('/api/auth/logout').expect(200);
    const guestRes = await agent.post('/api/auth/guest').expect(201);
    const guestToken = guestRes.body.accessToken;
    await agent.post('/api/cart').set('Authorization', `Bearer ${guestToken}`).send({ productId: realProduct.id, quantity: 1 }).expect(201);
    // Guest's copy is selected-for-checkout by default (verified by an earlier test).

    // Log back in as the real user — transferGuestCart runs.
    await agent.post('/api/auth/login').send({ email, password }).expect(200);

    // The destination user's row for SHARED must STILL be unchecked;
    // qty merged from guest's 1 (and earlier 2) = 3, but the flag
    // does not flip to true.
    const after = await prisma.cartItem.findFirst({
      where: { userId: guestRes.body.user.id /* fallback */, productId: realProduct.id },
    });
    // The destination user is the real user, NOT the guest (the guest
    // cookie sub shouldn't match). Force-fetch by the real user's id
    // we know — re-derive from email so we don't rely on a stale local.
    const realUser = await prisma.user.findUnique({ where: { email } });
    const merged = await prisma.cartItem.findFirst({ where: { userId: realUser.id, productId: realProduct.id } });
    assert.ok(merged, 'real user should still own the SHARED row after merge');
    assert.equal(merged.quantity, 3, 'quantities merge');
    assert.equal(merged.selectedForCheckout, false, 'destination saved-for-later precedence must NOT be overridden by guest selection');
    // Sanity: guest's copy is gone.
    assert.equal(after, null, 'guest row was merged out');
    void after; // silence no-var warning if tree-shaken
  });
});
