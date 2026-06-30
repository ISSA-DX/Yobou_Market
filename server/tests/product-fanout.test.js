// Tests that notifyProductChange fans out correctly across:
//   1. Catalog SSE channel (event: catalog) — every connected client
//   2. Admin inbox rows — every admin gets a Notification
//   3. Vendor owner row — when the product belongs to a vendor
//
// We drive the helper directly (not through the HTTP routes) so the
// tests stay focused on the fan-out logic itself. The HTTP-level wiring
// is covered by products-admin-audit.test.js (admin writes) and the
// approval path is exercised in changes.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const { resetTestDb, prisma } = require('./helper');
const n = require('../src/lib/notifications');

async function makeUser(role, extras = {}) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: 'x',
      role,
      ...extras,
    },
    include: { vendor: true },
  });
}

test('notifyProductChange — pushes catalog event to every connected client', async () => {
  await resetTestDb();
  const customer = await makeUser('CUSTOMER');
  const partner = await makeUser('VENDOR', {
    vendor: { create: { businessName: 'P', phone: '555', status: 'APPROVED' } },
  });
  const product = await prisma.product.create({
    data: {
      name: 'Cat Hat',
      description: 'd',
      priceCents: 1000,
      category: 'Apparel',
      imageUrls: '[]',
      status: 'LIVE',
      stock: 3,
      vendorId: partner.vendor.id,
    },
    include: { vendor: { select: { userId: true } } },
  });

  // Two fake SSE clients subscribed to the catalog channel (customer + partner).
  const customerRes = { write: (s) => customerFrames.push(s) };
  const partnerRes = { write: (s) => partnerFrames.push(s) };
  const customerFrames = [];
  const partnerFrames = [];
  // Re-bind writes so the closures see the arrays.
  customerRes.write = (s) => customerFrames.push(s);
  partnerRes.write = (s) => partnerFrames.push(s);
  n.registerCatalog(customer.id, customerRes);
  n.registerCatalog(partner.id, partnerRes);

  await n.notifyProductChange({ action: 'create', product });

  assert.strictEqual(customerFrames.length, 1, 'customer should receive exactly one catalog frame');
  assert.strictEqual(partnerFrames.length, 1, 'partner should receive exactly one catalog frame');

  // Frame shape: event: catalog (note: the SSE line is `event: <kind>` —
  // we re-send the kind on `event: catalog` and put the kind in data).
  assert.match(customerFrames[0], /^event: /, 'SSE frame should start with `event: `');
  assert.match(customerFrames[0], /"event":"product_created"/, 'frame data should include product_created');
  assert.match(customerFrames[0], /"productId":"[^"]+"/, 'frame data should include productId');
  assert.match(customerFrames[0], /"productName":"Cat Hat"/, 'frame data should include the product name');

  // Cleanup.
  n.unregisterCatalog(customer.id, customerRes);
  n.unregisterCatalog(partner.id, partnerRes);
  await prisma.notification.deleteMany();
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.user.deleteMany({ where: { id: { in: [customer.id, partner.id] } } });
});

test('notifyProductChange — writes inbox row for every admin', async () => {
  await resetTestDb();
  const admin1 = await makeUser('ADMIN');
  const admin2 = await makeUser('ADMIN');
  const product = await prisma.product.create({
    data: {
      name: 'Admin Inbox Hat',
      description: 'd',
      priceCents: 500,
      category: 'Apparel',
      imageUrls: '[]',
      status: 'LIVE',
      stock: 1,
    },
  });

  await n.notifyProductChange({ action: 'create', product });

  const notes = await prisma.notification.findMany({
    where: { userId: { in: [admin1.id, admin2.id] } },
  });
  assert.strictEqual(notes.length, 2, `expected 2 admin inbox rows, got ${notes.length}`);
  for (const note of notes) {
    assert.strictEqual(note.kind, 'product_created');
    assert.match(note.title, /Admin Inbox Hat/);
  }
});

test('notifyProductChange — writes inbox row for the owning vendor (not for admin)', async () => {
  await resetTestDb();
  const admin = await makeUser('ADMIN');
  const vendor = await makeUser('VENDOR', {
    vendor: { create: { businessName: 'V Co', phone: '555', status: 'APPROVED' } },
  });
  const product = await prisma.product.create({
    data: {
      name: 'Vendor Hat',
      description: 'd',
      priceCents: 500,
      category: 'Apparel',
      imageUrls: '[]',
      status: 'LIVE',
      stock: 1,
      vendorId: vendor.vendor.id,
    },
    include: { vendor: { select: { userId: true } } },
  });

  await n.notifyProductChange({ action: 'update', product: { ...product, name: 'Vendor Hat v2' } });

  // Admin gets an inbox row, vendor gets an inbox row — two total. The
  // customer is NOT included (catalog events only, no inbox clutter).
  const notes = await prisma.notification.findMany({});
  const byUser = Object.fromEntries(notes.map((x) => [x.userId, x]));
  assert.ok(byUser[admin.id], 'admin should have an inbox row');
  assert.ok(byUser[vendor.id], 'vendor should have an inbox row');
  assert.strictEqual(byUser[admin.id].kind, 'product_updated');
  assert.strictEqual(byUser[vendor.id].kind, 'product_updated');
  assert.match(byUser[vendor.id].title, /Vendor Hat v2/);
});

test('notifyProductChange — vendor-less product skips vendor branch gracefully', async () => {
  await resetTestDb();
  const admin = await makeUser('ADMIN');
  const product = await prisma.product.create({
    data: {
      name: 'Yobou Direct',
      description: 'd',
      priceCents: 500,
      category: 'Apparel',
      imageUrls: '[]',
      status: 'LIVE',
      stock: 1,
      // vendorId intentionally omitted — Yobou-Direct product.
    },
  });

  // Should not throw on the missing-vendor branch.
  await n.notifyProductChange({ action: 'create', product });

  const notes = await prisma.notification.findMany({ where: { userId: admin.id } });
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].kind, 'product_created');
});

test('notifyProductChange — delete event still writes admin inbox row', async () => {
  await resetTestDb();
  const admin = await makeUser('ADMIN');
  const product = {
    id: 'p_to_delete',
    name: 'About to die',
    category: 'X',
    vendorId: null,
    priceCents: 1,
    imageUrls: '[]',
    status: 'LIVE',
    stock: 0,
  };

  await n.notifyProductChange({ action: 'delete', product });

  const notes = await prisma.notification.findMany({ where: { userId: admin.id } });
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].kind, 'product_deleted');
  assert.match(notes[0].title, /About to die/);
});

test('notifyProductChange — kind maps correctly for create/update/delete', async () => {
  await resetTestDb();
  const admin = await makeUser('ADMIN');
  for (const action of ['create', 'update', 'delete']) {
    await prisma.notification.deleteMany({ where: { userId: admin.id } });
    await n.notifyProductChange({ action, product: { id: 'x', name: 'K', category: 'C', vendorId: null } });
    const note = await prisma.notification.findFirst({ where: { userId: admin.id } });
    const expected = action === 'create' ? 'product_created'
                   : action === 'update' ? 'product_updated'
                   : 'product_deleted';
    assert.strictEqual(note.kind, expected, `action=${action} should map to kind=${expected}`);
  }
});