// Tests for POST /api/admin/products/:id/notify-vendors — the endpoint
// the admin "post-publish" success page uses to ping selected vendors
// that a product is live.
//
// Contract:
//   - admin only (vendors get 403).
//   - 404 when the product doesn't exist.
//   - ineligible recipients (non-VENDOR, PENDING vendor) are silently
//     skipped; the response counts `sent` (delivered) vs `skipped`.
//   - writes one Notification row per eligible recipient + an
//     adminAuditLog row.
//   - the personal message body is the only field allowed to vary
//     beyond "Heads up: <name> is live" — title is fixed so the inbox
//     rows are visually consistent across the broadcast history.
const { test } = require('node:test');
const assert = require('node:assert');
const { resetTestDb, prisma, request, signAccessFor, getApp } = require('./helper');

async function makeUser(role, extras = {}) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: 'x',
      role,
      ...extras,
    },
  });
}

test('admin notify-vendors — sends to every approved vendor', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const v1 = await makeUser('VENDOR', { vendor: { create: { businessName: 'A Co', phone: '1', status: 'APPROVED' } } });
  const v2 = await makeUser('VENDOR', { vendor: { create: { businessName: 'B Co', phone: '2', status: 'APPROVED' } } });
  const token = signAccessFor(admin);

  const create = await prisma.product.create({
    data: { name: 'Hat', description: 'd', priceCents: 100, category: 'Apparel', imageUrls: '[]', stock: 1, status: 'LIVE' },
  });

  const res = await request(app, 'POST', `/api/admin/products/${create.id}/notify-vendors`, {
    token,
    body: { vendorUserIds: [v1.id, v2.id], message: 'Hat is now live — go check the storefront.' },
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  assert.strictEqual(res.body.sent, 2);
  assert.strictEqual(res.body.skipped, 0);

  const inbox = await prisma.notification.findMany({ where: { userId: { in: [v1.id, v2.id] } } });
  assert.strictEqual(inbox.length, 2);
  for (const note of inbox) {
    assert.strictEqual(note.kind, 'admin_broadcast');
    assert.match(note.title, /Hat is live/);
    assert.match(note.body, /Hat is now live/);
    assert.strictEqual(note.link, `/products/${create.id}`);
  }

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'product.notify_vendors', entityId: create.id },
  });
  assert.ok(audit);
  assert.match(audit.meta, /recipientCount.:2/);
});

test('admin notify-vendors — silently skips pending vendors and non-vendors', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const approved = await makeUser('VENDOR', { vendor: { create: { businessName: 'OK', phone: '1', status: 'APPROVED' } } });
  const pending = await makeUser('VENDOR', { vendor: { create: { businessName: 'WAIT', phone: '2', status: 'PENDING' } } });
  const customer = await makeUser('CUSTOMER');
  const token = signAccessFor(admin);

  const create = await prisma.product.create({
    data: { name: 'Mug', description: 'd', priceCents: 100, category: 'Home', imageUrls: '[]', stock: 1 },
  });

  const res = await request(app, 'POST', `/api/admin/products/${create.id}/notify-vendors`, {
    token,
    body: { vendorUserIds: [approved.id, pending.id, customer.id], message: 'Mug is live.' },
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.sent, 1);
  assert.strictEqual(res.body.skipped, 2);

  // The eligible vendor got one row, the rest got nothing.
  const inbox = await prisma.notification.findMany();
  assert.strictEqual(inbox.length, 1);
  assert.strictEqual(inbox[0].userId, approved.id);
});

test('admin notify-vendors — returns 404 for an unknown product', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const v = await makeUser('VENDOR', { vendor: { create: { businessName: 'X', phone: '1', status: 'APPROVED' } } });
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/admin/products/not_a_real_id/notify-vendors', {
    token,
    body: { vendorUserIds: [v.id], message: 'hi' },
  });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, 'NOT_FOUND');
});

test('admin notify-vendors — rejects vendor users with 403', async () => {
  await resetTestDb();
  const app = getApp();
  const vendorUser = await makeUser('VENDOR', { vendor: { create: { businessName: 'V', phone: '1', status: 'APPROVED' } } });
  const token = signAccessFor(vendorUser);

  const create = await prisma.product.create({
    data: { name: 'P', description: 'd', priceCents: 1, category: 'C', imageUrls: '[]', stock: 1 },
  });

  const res = await request(app, 'POST', `/api/admin/products/${create.id}/notify-vendors`, {
    token,
    body: { vendorUserIds: [vendorUser.id], message: 'x' },
  });
  assert.strictEqual(res.status, 403);
});

test('admin notify-vendors — empty recipient list returns 400 INVALID_INPUT', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const create = await prisma.product.create({
    data: { name: 'P', description: 'd', priceCents: 1, category: 'C', imageUrls: '[]', stock: 1 },
  });

  const res = await request(app, 'POST', `/api/admin/products/${create.id}/notify-vendors`, {
    token,
    body: { vendorUserIds: [], message: 'x' },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'INVALID_INPUT');
});

test('GET /api/admin/vendors — returns only APPROVED vendors', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  await makeUser('VENDOR', { vendor: { create: { businessName: 'OK', phone: '1', status: 'APPROVED' } } });
  await makeUser('VENDOR', { vendor: { create: { businessName: 'WAIT', phone: '2', status: 'PENDING' } } });
  await makeUser('CUSTOMER');

  const res = await request(app, 'GET', '/api/admin/vendors', { token });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.vendors.length, 1);
  assert.strictEqual(res.body.vendors[0].businessName, 'OK');
});