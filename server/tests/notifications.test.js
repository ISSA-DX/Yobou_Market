const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role, extras = {}) {
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: 'x',
      role,
      ...extras,
    },
    include: { vendor: true },
  });
  return user;
}

async function loginAs(role, extras) {
  const user = await makeUser(role, extras);
  const token = signAccessFor(user);
  return { user, token };
}

test('notifications — admin cancel writes Notification rows for customer, vendors, admins', async () => {
  await resetTestDb();
  const app = getApp();

  const admin = await makeUser('ADMIN');
  const customer = await makeUser('CUSTOMER');
  const vendorUser = await makeUser('VENDOR', {
    vendor: { create: { businessName: 'V Co', phone: '555', status: 'APPROVED' } },
  });
  const addr = await prisma.address.create({
    data: { userId: customer.id, line1: '1 St', city: 'C', state: 'S', postal: 'P' },
  });
  const product = await prisma.product.create({
    data: {
      name: 'P', description: '', priceCents: 1000, category: 'C',
      imageUrls: '[]', stock: 10, status: 'LIVE', vendorId: vendorUser.vendor.id,
    },
  });

  // Place an order so the cancel has a real target.
  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      addressId: addr.id,
      totalCents: 2000,
      paymentMethod: 'CARD',
      status: 'PAID',
      items: { create: [{ productId: product.id, quantity: 2, priceCents: 1000 }] },
      timeline: { create: [{ status: 'PLACED', actorRole: 'SYSTEM' }, { status: 'PAID', actorRole: 'SYSTEM' }] },
    },
  });

  const adminToken = signAccessFor(admin);
  const res = await request(app, 'POST', `/api/orders/${order.id}/cancel`, {
    token: adminToken,
    body: { reason: 'Out of stock — issuing refund' },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));

  // Three notification rows: customer, vendor, admin.
  const notes = await prisma.notification.findMany({ where: { userId: { in: [customer.id, vendorUser.id, admin.id] } } });
  assert.strictEqual(notes.length, 3, `expected 3 notifications, got ${notes.length}`);
  const customerNote = notes.find((n) => n.userId === customer.id);
  assert.ok(customerNote, 'customer missing notification');
  assert.strictEqual(customerNote.kind, 'order_cancelled');
  assert.match(customerNote.body, /Out of stock/);
});

test('notifications — SSE endpoint streams a notification frame on notify()', async () => {
  await resetTestDb();
  const app = getApp();
  // Create user with promotions opt-in so the broadcast kind isn't suppressed.
  const user = await prisma.user.create({
    data: {
      email: `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: 'SSE Test',
      passwordHash: 'x',
      role: 'CUSTOMER',
      notifyPromotions: true,
    },
  });
  const token = signAccessFor(user);

  // Open SSE, then notify via the helper. Read until we see the notification.
  const events = [];

  const ssePromise = new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/events`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.strictEqual(res.status, 200);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        // Wait up to 4s for the hello + notification frames.
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline) {
          const remaining = Math.max(100, deadline - Date.now());
          const { value, done } = await Promise.race([
            reader.read(),
            new Promise((r) => setTimeout(() => r({ value: null, done: false }), remaining)),
          ]);
          if (done) break;
          if (value) {
            const text = decoder.decode(value);
            events.push(text);
            if (text.includes('event: notification')) break;
          }
        }
        reader.cancel().catch(() => {});
        server.close();
        resolve();
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });

  // Wait long enough for SSE to connect + register before notifying.
  await new Promise((r) => setTimeout(r, 300));

  const { notify } = require('../src/lib/notifications');
  await notify(user.id, { kind: 'admin_broadcast', title: 'Hello', body: 'Test' });

  await ssePromise;

  const text = events.join('');
  assert.match(text, /event: hello/, `expected hello frame, got: ${text}`);
  assert.match(text, /event: notification/, `expected notification frame, got: ${text}`);
  assert.match(text, /Hello/, `expected title in payload, got: ${text}`);
});

test('notifications — /api/notifications inbox lists user notifications', async () => {
  await resetTestDb();
  const app = getApp();
  const user = await makeUser('CUSTOMER');
  const token = signAccessFor(user);
  await prisma.notification.create({
    data: { userId: user.id, kind: 'order_status', title: 'T', body: 'B' },
  });
  const res = await request(app, 'GET', '/api/notifications', { token });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.notifications.length, 1);
  assert.strictEqual(res.body.unreadCount, 1);
});

test('notifications — mark-read and read-all update readAt', async () => {
  await resetTestDb();
  const app = getApp();
  const user = await makeUser('CUSTOMER');
  const token = signAccessFor(user);
  const n1 = await prisma.notification.create({
    data: { userId: user.id, kind: 'order_status', title: 'T1', body: 'B' },
  });
  const n2 = await prisma.notification.create({
    data: { userId: user.id, kind: 'order_status', title: 'T2', body: 'B' },
  });

  const r1 = await request(app, 'PATCH', `/api/notifications/${n1.id}/read`, { token });
  assert.strictEqual(r1.status, 200);
  const after1 = await prisma.notification.findUnique({ where: { id: n1.id } });
  assert.ok(after1.readAt);

  const r2 = await request(app, 'POST', '/api/notifications/read-all', { token });
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(r2.body.marked, 1);
  const after2 = await prisma.notification.findUnique({ where: { id: n2.id } });
  assert.ok(after2.readAt);
});