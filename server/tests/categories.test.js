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

test('categories — POST /backfill populates the curated table from seed + live products', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  // Pre-condition: a live product references a free-form category that
  // the curated table doesn't yet know about. This is exactly the
  // situation that produced the empty-picker bug on the live Render
  // database.
  await prisma.product.create({
    data: {
      name: 'Test Headphones',
      description: '',
      priceCents: 999,
      category: 'Electronics',
      imageUrls: '[]',
      status: 'LIVE',
      stock: 5,
    },
  });

  const before = await prisma.category.count();
  assert.strictEqual(before, 0, 'curated table should be empty at start');

  // Non-admin gets 403 — the backfill is a repair operation, not a free
  // endpoint.
  const customer = await makeUser('CUSTOMER');
  const customerToken = signAccessFor(customer);
  const denied = await request(app, 'POST', '/api/categories/backfill', { token: customerToken });
  assert.strictEqual(denied.status, 403, `expected 403 for non-admin, got ${denied.status}`);

  // Admin runs the backfill — should create the 28 seed categories.
  const res = await request(app, 'POST', '/api/categories/backfill', { token });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  assert.strictEqual(res.body.created, 28, `expected 28 created, got ${res.body.created}`);

  const after = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  const names = after.map((c) => c.name);
  // Spot-check the start, middle, and end of the seeded list — the
  // exact array lives in SEED_CATEGORIES on the server side; if the
  // full list ever drifts, this test will catch it.
  assert.deepStrictEqual(
    names.slice(0, 6),
    ['Appliances', 'Arts & Crafts', 'Automotive', 'Baby', 'Bags', 'Beauty'],
  );
  assert.ok(names.includes('TV & Audio'), 'multi-word category should be present');
  assert.ok(names.includes('Musical Instruments'), 'expanded musical category should be present');
  assert.strictEqual(names.length, 28, `expected 28 categories, got ${names.length}`);

  // Idempotent: a second call creates 0.
  const second = await request(app, 'POST', '/api/categories/backfill', { token });
  assert.strictEqual(second.body.created, 0);
});

test('categories — GET includes free-form live product categories with source="live"', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  // One curated row.
  await request(app, 'POST', '/api/categories', { token, body: { name: 'Electronics' } });

  // Two LIVE products, one in a curated name, one in a free-form
  // name not yet in the curated table.
  await prisma.product.create({
    data: { name: 'Earbuds', description: 'd', priceCents: 100, category: 'Electronics', imageUrls: '[]', status: 'LIVE', stock: 1 },
  });
  await prisma.product.create({
    data: { name: 'Pixel 9', description: 'd', priceCents: 900, category: 'Phone', imageUrls: '[]', status: 'LIVE', stock: 3 },
  });

  const res = await request(app, 'GET', '/api/categories', { token });
  assert.strictEqual(res.status, 200);
  const list = res.body.categories;

  // "Electronics" is curated (not duplicated as a live row).
  const electronics = list.filter((c) => c.name === 'Electronics');
  assert.strictEqual(electronics.length, 1, 'curated name should appear exactly once');
  assert.strictEqual(electronics[0].source, 'curated');

  // "Phone" is synthesised from live products.
  const phone = list.find((c) => c.name === 'Phone');
  assert.ok(phone, 'expected free-form "Phone" in the response');
  assert.strictEqual(phone.source, 'live');
  assert.strictEqual(phone.id, null);
  assert.strictEqual(phone.productCount, 1);

  // Curated rows sort before live rows.
  const electronicsIdx = list.findIndex((c) => c.name === 'Electronics');
  const phoneIdx = list.findIndex((c) => c.name === 'Phone');
  assert.ok(electronicsIdx < phoneIdx, 'curated rows should sort before live rows');
});

test('categories — GET ?curatedOnly=1 hides live-sourced rows', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);
  await request(app, 'POST', '/api/categories', { token, body: { name: 'Electronics' } });
  await prisma.product.create({
    data: { name: 'P', description: 'd', priceCents: 1, category: 'Phone', imageUrls: '[]', status: 'LIVE', stock: 1 },
  });

  const res = await request(app, 'GET', '/api/categories?curatedOnly=1', { token });
  assert.strictEqual(res.status, 200);
  const names = res.body.categories.map((c) => c.name);
  assert.deepStrictEqual(names, ['Electronics'], 'curatedOnly should exclude live-sourced rows');
});

test('categories — seed-file CATEGORIES array matches SEED_CATEGORIES on the route', async () => {
  // Drift between the two arrays is the kind of bug that lives for
  // months unnoticed. The seed file and the route helper both ship
  // a curated list; this test compares them so a mismatch fails CI.
  // eslint-disable-next-line global-require
  const seed = require('../prisma/seed.js');
  // The CATEGORIES const in the seed file isn't exported, so re-read
  // the file as text and pull the array literal out.
  // eslint-disable-next-line global-require
  const fs = require('node:fs');
  // eslint-disable-next-line global-require
  const path = require('node:path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'prisma', 'seed.js'),
    'utf8',
  );
  const m = src.match(/const CATEGORIES = \[([\s\S]*?)\];/);
  assert.ok(m, 'expected to find `const CATEGORIES = [...]` in prisma/seed.js');
  const seedNames = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^['"]|['"]$/g, ''));

  // eslint-disable-next-line global-require
  const categoriesRouter = require('../src/routes/categories');
  const routeNames = categoriesRouter.SEED_CATEGORIES;
  assert.ok(Array.isArray(routeNames), 'SEED_CATEGORIES should be exported as an array');
  assert.strictEqual(
    routeNames.length,
    seedNames.length,
    `seed file lists ${seedNames.length} categories but the route's SEED_CATEGORIES has ${routeNames.length}`,
  );
  for (const n of seedNames) {
    assert.ok(routeNames.includes(n), `route SEED_CATEGORIES missing "${n}" from the seed file`);
  }
  for (const n of routeNames) {
    assert.ok(seedNames.includes(n), `seed file CATEGORIES missing "${n}" from the route's SEED_CATEGORIES`);
  }
  // Touch seed so the require call doesn't get tree-shaken; this also
  // documents the intent that the two arrays must stay in lockstep.
  assert.ok(seed, 'seed module should be importable');
});