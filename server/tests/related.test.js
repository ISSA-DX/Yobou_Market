// Tests for GET /api/products/:id/related ("Customers also viewed").
//
//   - Excludes the target product from the response.
//   - Never crosses category boundaries.
//   - LIVE only — DRAFT/HIDDEN never appear in the rail.
//   - In-stock items sort before out-of-stock (the rail is a
//     conversion surface, dead inventory belongs at the back).
//   - Honors ?limit=1..20 (defaults to 10).
const { test } = require('node:test');
const assert = require('node:assert');
const { request, resetTestDb, prisma, getApp } = require('./helper');

async function makeProduct({ name, category = 'Electronics', stock = 5, status = 'LIVE' }) {
  return prisma.product.create({
    data: {
      name,
      description: '',
      priceCents: 1000,
      category,
      imageUrls: '[]',
      stock,
      status,
    },
  });
}

test('related — excludes self, in-stock sorts before out-of-stock, never crosses category', async () => {
  await resetTestDb();
  const app = getApp();
  const target = await makeProduct({ name: 'Target', stock: 0 });
  const instock = await makeProduct({ name: 'InStock', stock: 10 });
  const midstock = await makeProduct({ name: 'MidStock', stock: 3 });
  const outstock = await makeProduct({ name: 'OutStock', stock: 0 });
  const fashion = await makeProduct({ name: 'Fashion', category: 'Fashion' });
  const draft = await makeProduct({ name: 'Draft', status: 'DRAFT' });

  const res = await request(app, 'GET', `/api/products/${target.id}/related`);
  assert.strictEqual(res.status, 200);
  const ids = res.body.products.map((p) => p.id);
  // Self excluded.
  assert.ok(!ids.includes(target.id));
  // Category boundary respected.
  assert.ok(!ids.includes(fashion.id));
  // DRAFT excluded.
  assert.ok(!ids.includes(draft.id));
  // In-stock (10) before mid-stock (3) before out-of-stock (0).
  assert.deepStrictEqual(ids, [instock.id, midstock.id, outstock.id]);
});

test('related — ?limit clamps the response to N items', async () => {
  await resetTestDb();
  const app = getApp();
  const target = await makeProduct({ name: 'Target' });
  for (let i = 0; i < 5; i += 1) {
    await makeProduct({ name: `P${i}`, stock: 5 - i });
  }
  const res = await request(app, 'GET', `/api/products/${target.id}/related?limit=2`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.products.length, 2);
});

test('related — empty when the target category has no other products', async () => {
  await resetTestDb();
  const app = getApp();
  const only = await makeProduct({ name: 'OnlyOne', category: 'Loner' });
  const res = await request(app, 'GET', `/api/products/${only.id}/related`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.products, []);
});
