const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role, extras = {}) {
  const bcrypt = require('bcrypt');
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: await bcrypt.hash('Password123!', 4),
      role,
      ...extras,
    },
    include: { vendor: true },
  });
}

test('admin broadcast — fans out to the selected audience', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const customer1 = await makeUser('CUSTOMER');
  const customer2 = await makeUser('CUSTOMER');
  const vendorUser = await makeUser('VENDOR', {
    vendor: { create: { businessName: 'V', phone: '5', status: 'APPROVED' } },
  });
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/admin/broadcast', {
    token,
    body: { title: 'Hello customers', body: 'Sale starts tomorrow', audience: 'customers' },
  });
  assert.ok(res.status === 200 || res.status === 201, JSON.stringify(res.body));
  const recipients = res.body.recipients ?? res.body.recipientCount;
  assert.ok(recipients >= 2, `expected at least 2 customer recipients, got ${recipients}`);

  const notes = await prisma.notification.findMany({ where: { kind: 'admin_broadcast' } });
  assert.strictEqual(notes.length, recipients);
  // Vendor should not have received a customer broadcast.
  assert.ok(!notes.some((n) => n.userId === vendorUser.id));
  // Admin should not be in the customer-audience recipients either.
  assert.ok(!notes.some((n) => n.userId === admin.id));
});

test('admin broadcast — audit entry written', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/admin/broadcast', {
    token,
    body: { title: 'T', body: 'B', audience: 'all' },
  });
  assert.ok(res.status === 200 || res.status === 201, JSON.stringify(res.body));

  const audit = await prisma.adminAuditLog.findFirst({
    where: { actorId: admin.id, action: 'broadcast.send' },
  });
  assert.ok(audit, 'expected audit row for broadcast.send');
});

test('admin broadcast — non-admin rejected', async () => {
  await resetTestDb();
  const app = getApp();
  const customer = await makeUser('CUSTOMER');
  const token = signAccessFor(customer);
  const res = await request(app, 'POST', '/api/admin/broadcast', {
    token,
    body: { title: 'X', body: 'Y', audience: 'all' },
  });
  assert.strictEqual(res.status, 403);
});
