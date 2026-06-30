// Tests for /api/categories CRUD — admin-only writes, auto-slug, soft-delete
// when products still reference the name, and the audit/catalog events
// emitted on every mutation.
const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

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

test('categories — POST requires admin; non-admin returns 403', async () => {
  await resetTestDb();
  const app = getApp();
  const customer = await makeUser('CUSTOMER');
  const token = signAccessFor(customer);
  const res = await request(app, 'POST', '/api/categories', {
    token,
    body: { name: 'Electronics' },
  });
  assert.strictEqual(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`);
});

test('categories — POST as admin auto-derives slug and writes the row', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/categories', {
    token,
    body: { name: 'Outdoor Gear' },
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  assert.strictEqual(res.body.category.name, 'Outdoor Gear');
  assert.strictEqual(res.body.category.slug, 'outdoor-gear');
  assert.strictEqual(res.body.category.isActive, true);

  const row = await prisma.category.findUnique({ where: { slug: 'outdoor-gear' } });
  assert.ok(row, 'category row should exist');
  assert.strictEqual(row.name, 'Outdoor Gear');

  // Audit entry recorded for the create.
  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'category.create', entityId: row.id },
  });
  assert.ok(audit, 'expected category.create audit row');
  assert.strictEqual(audit.actorId, admin.id);
});

test('categories — POST with explicit slug honours it', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/categories', {
    token,
    body: { name: 'Pet Supplies', slug: 'pets' },
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  assert.strictEqual(res.body.category.slug, 'pets');
});

test('categories — duplicate name/slug returns 409', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const first = await request(app, 'POST', '/api/categories', {
    token,
    body: { name: 'Books' },
  });
  assert.strictEqual(first.status, 201);

  const dup = await request(app, 'POST', '/api/categories', {
    token,
    body: { name: 'Books' },
  });
  assert.strictEqual(dup.status, 409, JSON.stringify(dup.body));
  assert.strictEqual(dup.body.error, 'CATEGORY_EXISTS');
});

test('categories — GET lists active categories with LIVE product counts', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  await request(app, 'POST', '/api/categories', { token, body: { name: 'Electronics' } });
  await request(app, 'POST', '/api/categories', { token, body: { name: 'Books' } });

  // One LIVE product in Electronics, one DRAFT in Electronics, one LIVE in Books.
  await prisma.product.create({
    data: { name: 'Earbuds', description: 'd', priceCents: 100, category: 'Electronics', imageUrls: '[]', status: 'LIVE', stock: 1 },
  });
  await prisma.product.create({
    data: { name: 'Tablet', description: 'd', priceCents: 200, category: 'Electronics', imageUrls: '[]', status: 'DRAFT', stock: 1 },
  });
  await prisma.product.create({
    data: { name: 'Novel', description: 'd', priceCents: 300, category: 'Books', imageUrls: '[]', status: 'LIVE', stock: 1 },
  });

  // GET requires auth but is open to all roles.
  const customer = await makeUser('CUSTOMER');
  const cToken = signAccessFor(customer);
  const res = await request(app, 'GET', '/api/categories', { token: cToken });
  assert.strictEqual(res.status, 200);
  const list = res.body.categories;
  const electronics = list.find((c) => c.name === 'Electronics');
  const books = list.find((c) => c.name === 'Books');
  assert.strictEqual(electronics.productCount, 1, 'only LIVE products counted');
  assert.strictEqual(books.productCount, 1);
});

test('categories — GET ?includeInactive=1 includes archived rows', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const created = await request(app, 'POST', '/api/categories', { token, body: { name: 'ArchiveMe' } });
  const id = created.body.category.id;

  // Soft-delete (because a product references the name).
  await prisma.product.create({
    data: { name: 'P', description: 'd', priceCents: 1, category: 'ArchiveMe', imageUrls: '[]', status: 'LIVE', stock: 1 },
  });
  const del = await request(app, 'DELETE', `/api/categories/${id}`, { token });
  assert.strictEqual(del.status, 200);
  assert.strictEqual(del.body.category.isActive, false);

  const customer = await makeUser('CUSTOMER');
  const cToken = signAccessFor(customer);
  const activeOnly = await request(app, 'GET', '/api/categories', { token: cToken });
  assert.strictEqual(activeOnly.body.categories.find((c) => c.id === id), undefined);

  const withInactive = await request(app, 'GET', '/api/categories?includeInactive=1', { token: cToken });
  const row = withInactive.body.categories.find((c) => c.id === id);
  assert.ok(row, 'inactive row should appear with includeInactive');
  assert.strictEqual(row.isActive, false);
});

test('categories — DELETE soft-deletes when products exist, hard-deletes otherwise', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  // Case 1: with products -> soft-delete.
  const withProds = await request(app, 'POST', '/api/categories', { token, body: { name: 'WithProds' } });
  await prisma.product.create({
    data: { name: 'P', description: 'd', priceCents: 1, category: 'WithProds', imageUrls: '[]', status: 'LIVE', stock: 1 },
  });
  const soft = await request(app, 'DELETE', `/api/categories/${withProds.body.category.id}`, { token });
  assert.strictEqual(soft.status, 200);
  assert.strictEqual(soft.body.category.isActive, false);
  const stillThere = await prisma.category.findUnique({ where: { id: withProds.body.category.id } });
  assert.ok(stillThere, 'soft-deleted row should still exist');
  assert.strictEqual(stillThere.isActive, false);

  // Case 2: no products -> hard delete.
  const empty = await request(app, 'POST', '/api/categories', { token, body: { name: 'Empty' } });
  const hard = await request(app, 'DELETE', `/api/categories/${empty.body.category.id}`, { token });
  assert.strictEqual(hard.status, 200);
  assert.strictEqual(hard.body.category.isActive, false);
  const gone = await prisma.category.findUnique({ where: { id: empty.body.category.id } });
  assert.strictEqual(gone, null, 'hard-deleted row should be gone');

  // Both emitted audit rows.
  const audits = await prisma.adminAuditLog.findMany({
    where: { action: { in: ['category.archive', 'category.delete'] } },
  });
  assert.strictEqual(audits.length, 2, `expected 2 audit rows, got ${audits.length}`);
});

test('categories — PATCH updates name/slug/isActive and emits audit', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const created = await request(app, 'POST', '/api/categories', { token, body: { name: 'Old Name' } });
  const id = created.body.category.id;

  const res = await request(app, 'PATCH', `/api/categories/${id}`, {
    token,
    body: { name: 'New Name', slug: 'new-name' },
  });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.category.name, 'New Name');
  assert.strictEqual(res.body.category.slug, 'new-name');

  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'category.update', entityId: id },
  });
  assert.ok(audit, 'expected category.update audit row');
});

test('categories — PATCH with empty body returns 400 (no fields to update)', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);
  const created = await request(app, 'POST', '/api/categories', { token, body: { name: 'X' } });
  const res = await request(app, 'PATCH', `/api/categories/${created.body.category.id}`, {
    token,
    body: {},
  });
  assert.strictEqual(res.status, 400);
});