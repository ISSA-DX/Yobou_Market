// Tests for color/size product variants.
//
// Variants are stored in a dedicated ProductVariant table with per-row
// stock; Product.stock is kept in sync (sum of variant stock when any
// variants exist, else the legacy single number). Variants enter admin
// flows directly via POST /api/products/admin and vendor flows through
// the ProductChange approval queue. Variants are optional — products
// without variants must keep working exactly as before.
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

async function makeApprovedVendor() {
  const user = await makeUser('VENDOR');
  return prisma.vendor.create({
    data: {
      userId: user.id,
      businessName: 'Acme Co',
      phone: '+15555550100',
      status: 'APPROVED',
      approvedAt: new Date(),
    },
  });
}

test('variants — admin POST /api/products/admin with variants sums stock and returns variants', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'T-Shirt',
      description: 'cotton tee',
      priceCents: 1999,
      category: 'Apparel',
      stock: 999, // ignored when variants are provided
      status: 'LIVE',
      variants: [
        { color: 'Black', size: 'S', stock: 3 },
        { color: 'Black', size: 'M', stock: 5 },
        { color: 'Red',   size: 'M', stock: 2 },
      ],
    },
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  assert.strictEqual(res.body.product.stock, 10, 'stock should be sum of variant stocks');
  assert.strictEqual(res.body.product.variants.length, 3);
  const colors = res.body.product.variants.map((v) => v.color).sort();
  assert.deepStrictEqual(colors, ['Black', 'Black', 'Red']);

  // DB rows really exist.
  const dbRows = await prisma.productVariant.findMany({
    where: { productId: res.body.product.id },
  });
  assert.strictEqual(dbRows.length, 3);

  // Audit log records the variant count.
  const audit = await prisma.adminAuditLog.findFirst({
    where: { action: 'product.create', entityId: res.body.product.id },
  });
  assert.ok(audit);
  assert.strictEqual(JSON.parse(audit.meta).variantCount, 3);
});

test('variants — admin POST with empty variants falls back to legacy stock', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const res = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'Hat',
      description: '',
      priceCents: 500,
      category: 'Apparel',
      stock: 7,
      variants: [],
    },
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  assert.strictEqual(res.body.product.stock, 7, 'legacy stock preserved when variants empty');
  assert.strictEqual(res.body.product.variants.length, 0);
});

test('variants — admin PATCH reconciles (delete removed rows, update edited, create new)', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  // Seed two variants.
  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'P', description: '', priceCents: 100, category: 'X', stock: 0,
      variants: [
        { color: 'Black', size: 'S', stock: 1 },
        { color: 'Black', size: 'M', stock: 2 },
      ],
    },
  });
  const id = create.body.product.id;
  const [v1, v2] = create.body.product.variants;
  assert.strictEqual(create.body.product.stock, 3);

  // PATCH: keep v1 (change its stock), drop v2, add a new one.
  const patch = await request(app, 'PATCH', `/api/products/${id}`, {
    token,
    body: {
      variants: [
        { id: v1.id, color: 'Black', size: 'S', stock: 9 },
        { color: 'Red', size: 'M', stock: 4 },
      ],
    },
  });
  assert.strictEqual(patch.status, 200, JSON.stringify(patch.body));
  assert.strictEqual(patch.body.product.stock, 13);
  const rows = patch.body.product.variants;
  assert.strictEqual(rows.length, 2);
  const dropped = rows.find((v) => v.id === v2.id);
  assert.strictEqual(dropped, undefined, 'v2 should have been deleted');
  const edited = rows.find((v) => v.id === v1.id);
  assert.strictEqual(edited.stock, 9);
  const created = rows.find((v) => v.color === 'Red');
  assert.ok(created, 'new Red/M variant should be created');
  assert.strictEqual(created.stock, 4);
});

test('variants — admin PATCH with empty variants clears them', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'P', description: '', priceCents: 1, category: 'X', stock: 0,
      variants: [{ color: 'Black', size: 'S', stock: 5 }],
    },
  });
  const id = create.body.product.id;

  const patch = await request(app, 'PATCH', `/api/products/${id}`, {
    token,
    body: { stock: 0, variants: [] },
  });
  assert.strictEqual(patch.status, 200, JSON.stringify(patch.body));
  assert.strictEqual(patch.body.product.variants.length, 0);
  assert.strictEqual(patch.body.product.stock, 0);
});

test('variants — oversize body (>200 rows) returns 400 INVALID_INPUT', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const variants = [];
  for (let i = 0; i < 201; i += 1) {
    variants.push({ color: 'C' + i, size: 'S', stock: 1 });
  }
  const res = await request(app, 'POST', '/api/products/admin', {
    token,
    body: { name: 'P', description: '', priceCents: 1, category: 'X', stock: 0, variants },
  });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, 'INVALID_INPUT');
});

test('variants — GET /api/products/:id returns the variants array', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const token = signAccessFor(admin);

  const create = await request(app, 'POST', '/api/products/admin', {
    token,
    body: {
      name: 'Sock', description: '', priceCents: 100, category: 'Apparel', stock: 0,
      variants: [
        { color: 'White', size: 'M', stock: 4 },
      ],
    },
  });
  const id = create.body.product.id;

  const get = await request(app, 'GET', `/api/products/${id}`, {});
  assert.strictEqual(get.status, 200);
  assert.strictEqual(get.body.product.variants.length, 1);
  assert.strictEqual(get.body.product.variants[0].color, 'White');
});

test('variants — vendor CREATE change carries proposedVariants; admin approve applies them', async () => {
  await resetTestDb();
  const app = getApp();
  const vendor = await makeApprovedVendor();
  const vendorUser = await prisma.user.findUnique({ where: { id: vendor.userId } });
  const vToken = signAccessFor(vendorUser);

  const admin = await makeUser('ADMIN');
  const aToken = signAccessFor(admin);

  // Vendor submits a CREATE change with variants.
  const submit = await request(app, 'POST', '/api/product-changes', {
    token: vToken,
    body: {
      action: 'CREATE',
      name: 'VendorTee',
      description: 'soft',
      priceCents: 1500,
      category: 'Apparel',
      stock: 0,
      variants: [
        { color: 'Blue', size: 'L', stock: 4 },
        { color: 'Blue', size: 'XL', stock: 6 },
      ],
    },
  });
  assert.strictEqual(submit.status, 201, JSON.stringify(submit.body));
  assert.strictEqual(submit.body.change.proposedVariants.length, 2);

  // proposedVariants JSON is on disk.
  const row = await prisma.productChange.findUnique({ where: { id: submit.body.change.id } });
  assert.ok(row.proposedVariants);
  assert.strictEqual(JSON.parse(row.proposedVariants).length, 2);

  // Admin approves — product created with variants and stock summed.
  const approve = await request(app, 'POST', `/api/product-changes/${submit.body.change.id}/approve`, {
    token: aToken,
    body: {},
  });
  assert.strictEqual(approve.status, 200, JSON.stringify(approve.body));

  const created = await prisma.product.findFirst({ where: { name: 'VendorTee' }, include: { variants: true } });
  assert.ok(created, 'product should exist after approval');
  assert.strictEqual(created.stock, 10);
  assert.strictEqual(created.variants.length, 2);
});

test('variants — vendor UPDATE change replaces existing variants on approval', async () => {
  await resetTestDb();
  const app = getApp();
  const vendor = await makeApprovedVendor();
  const vendorUser = await prisma.user.findUnique({ where: { id: vendor.userId } });
  const vToken = signAccessFor(vendorUser);

  const admin = await makeUser('ADMIN');
  const aToken = signAccessFor(admin);

  // Seed a product owned by this vendor with one variant.
  const seed = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      name: 'Cap', description: '', priceCents: 1000, category: 'Apparel',
      imageUrls: '[]', stock: 5, status: 'LIVE',
      variants: { create: [{ color: 'Black', size: 'One Size', stock: 5 }] },
    },
  });

  // Vendor submits an UPDATE change that adds a second variant.
  const submit = await request(app, 'POST', '/api/product-changes', {
    token: vToken,
    body: {
      action: 'UPDATE',
      productId: seed.id,
      variants: [
        { color: 'Black', size: 'One Size', stock: 5 },
        { color: 'White', size: 'One Size', stock: 3 },
      ],
    },
  });
  assert.strictEqual(submit.status, 201, JSON.stringify(submit.body));

  const approve = await request(app, 'POST', `/api/product-changes/${submit.body.change.id}/approve`, {
    token: aToken,
    body: {},
  });
  assert.strictEqual(approve.status, 200, JSON.stringify(approve.body));

  const updated = await prisma.product.findUnique({
    where: { id: seed.id },
    include: { variants: true },
  });
  assert.strictEqual(updated.variants.length, 2);
  assert.strictEqual(updated.stock, 8);
});