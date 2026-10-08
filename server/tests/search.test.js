const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { getApp, resetTestDb } = require('./helper');
const { prisma } = require('../src/prisma');

let app;

describe('Products search + faceted filters + pagination', { concurrency: 1 }, () => {
  before(async () => {
    app = getApp();
    await resetTestDb();
  });

  let counter = 0;
  async function seedAdmin() {
    counter += 1;
    const email = `admin-search-${counter}@test.com`;
    await prisma.user.create({
      data: {
        email,
        name: 'Admin',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'ADMIN',
      },
    });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
    return res.body.accessToken;
  }

  async function seedProduct(token, p) {
    return request(app)
      .post('/api/products/admin')
      .set('Authorization', `Bearer ${token}`)
      .send(p)
      .expect(201);
  }

  async function seedCatalog() {
    const t1 = await seedAdmin();
    const t2 = await seedAdmin();
    const t3 = await seedAdmin();
    await seedProduct(t1, { name: 'Red Sneakers', description: 'Comfy', priceCents: 2500, category: 'Shoes', stock: 10 });
    await seedProduct(t1, { name: 'Blue Sneakers', description: 'Cool', priceCents: 3500, category: 'Shoes', stock: 0 });
    await seedProduct(t2, { name: 'Laptop Pro', description: 'Fast machine', priceCents: 120000, category: 'Computers', stock: 5 });
    await seedProduct(t2, { name: 'Laptop Lite', description: 'Slow machine', priceCents: 60000, category: 'Computers', stock: 3 });
    await seedProduct(t3, { name: 'Headphones', description: 'Loud', priceCents: 8000, category: 'Electronics', stock: 0 });
  }

  it('preserves top-level products array (backward compat regression guard)', async () => {
    await seedCatalog();
    const res = await request(app).get('/api/products').expect(200);
    assert.ok(Array.isArray(res.body.products));
  });

  it('returns facets + pagination metadata in the response', async () => {
    const res = await request(app).get('/api/products').expect(200);
    assert.ok(res.body.facets, 'facets should exist');
    assert.ok(Array.isArray(res.body.facets.categories));
    assert.ok(Array.isArray(res.body.facets.vendors));
    assert.ok(res.body.facets.priceRange);
    assert.equal(typeof res.body.facets.priceRange.min, 'number');
    assert.equal(typeof res.body.facets.priceRange.max, 'number');
    assert.ok(res.body.pagination, 'pagination should exist');
    // 4 numeric page/pageSize/total/totalPages; hasMore is bool per
    // Amazon/Shopify convention and per the route's
    // `skip + products.length < total` expression.
    for (const k of ['page', 'pageSize', 'total', 'totalPages']) {
      assert.equal(typeof res.body.pagination[k], 'number', `pagination.${k} should be a number`);
    }
    assert.equal(typeof res.body.pagination.hasMore, 'boolean', 'pagination.hasMore should be a boolean');
  });

  it('categories facet lists all live categories with counts', async () => {
    const res = await request(app).get('/api/products').expect(200);
    const byName = Object.fromEntries(res.body.facets.categories.map((c) => [c.name, c.count]));
    assert.equal(byName.Shoes, 2);
    assert.equal(byName.Computers, 2);
    assert.equal(byName.Electronics, 1);
  });

  it('priceRange facet exposes the full price span over live products', async () => {
    const res = await request(app).get('/api/products').expect(200);
    assert.equal(res.body.facets.priceRange.min, 2500);
    assert.equal(res.body.facets.priceRange.max, 120000);
  });

  it('q search matches name + category + description', async () => {
    const r1 = await request(app).get('/api/products?q=laptop').expect(200);
    assert.equal(r1.body.products.length, 2);
    const r2 = await request(app).get('/api/products?q=loud').expect(200);
    assert.equal(r2.body.products.length, 1);
    assert.equal(r2.body.products[0].name, 'Headphones');
  });

  it('category filter narrows + still returns facets from the full catalogue', async () => {
    const res = await request(app).get('/api/products?category=Shoes').expect(200);
    assert.equal(res.body.products.length, 2);
    // Facets intentionally NOT narrowed — Shopify/Amzn UX pattern.
    assert.equal(res.body.facets.categories.length, 3);
  });

  it('minPrice + maxPrice filter applies both gte + lte predicates', async () => {
    const res = await request(app).get('/api/products?minPrice=5000&maxPrice=20000').expect(200);
    assert.equal(res.body.products.length, 1);
    assert.equal(res.body.products[0].name, 'Headphones');
  });

  it('inStock=true excludes zero-stock products', async () => {
    const res = await request(app).get('/api/products?inStock=true').expect(200);
    assert.equal(res.body.products.length, 3);
    assert.ok(res.body.products.every((p) => p.stock > 0));
  });



  it('sort=price-asc orders ascending by priceCents', async () => {
    const res = await request(app).get('/api/products?sort=price-asc').expect(200);
    for (let i = 1; i < res.body.products.length; i++) {
      assert.ok(res.body.products[i - 1].priceCents <= res.body.products[i].priceCents);
    }
  });

  it('sort=price-desc orders descending by priceCents', async () => {
    const res = await request(app).get('/api/products?sort=price-desc').expect(200);
    for (let i = 1; i < res.body.products.length; i++) {
      assert.ok(res.body.products[i - 1].priceCents >= res.body.products[i].priceCents);
    }
  });

  it('sort=name-asc orders alphabetically', async () => {
    const res = await request(app).get('/api/products?sort=name-asc').expect(200);
    for (let i = 1; i < res.body.products.length; i++) {
      assert.ok((res.body.products[i - 1].name || '').localeCompare(res.body.products[i].name || '') <= 0);
    }
  });

  it('paginates with page + pageSize', async () => {
    const page1 = await request(app).get('/api/products?page=1&pageSize=2').expect(200);
    const page2 = await request(app).get('/api/products?page=2&pageSize=2').expect(200);
    assert.equal(page1.body.products.length, 2);
    assert.ok(page2.body.products.length >= 1);
    assert.notEqual(page1.body.products[0].id, page2.body.products[0]?.id);
    assert.equal(page1.body.pagination.hasMore, true);
    assert.equal(page1.body.pagination.totalPages, 3); // 5 / 2 = 3
  });

  it('combines filter + sort + pagination correctly', async () => {
    const res = await request(app).get('/api/products?inStock=true&sort=price-asc&page=1&pageSize=2').expect(200);
    assert.ok(res.body.products.every((p) => p.stock > 0));
    assert.equal(res.body.products.length, 2);
    assert.equal(res.body.pagination.total, 3);
    assert.equal(res.body.pagination.totalPages, 2);
    for (let i = 1; i < res.body.products.length; i++) {
      assert.ok(res.body.products[i - 1].priceCents <= res.body.products[i].priceCents);
    }
  });

  it('minPrice > maxPrice returns INVALID_INPUT', async () => {
    const res = await request(app).get('/api/products?minPrice=2000&maxPrice=1000').expect(400);
    assert.equal(res.body.error, 'INVALID_INPUT');
  });

  it('returns empty products with valid facets+pagination when nothing matches', async () => {
    const res = await request(app).get('/api/products?q=NOMATCHSTRINGXYZ').expect(200);
    assert.equal(res.body.products.length, 0);
    assert.equal(res.body.pagination.total, 0);
    assert.equal(res.body.pagination.totalPages, 0);
    assert.equal(res.body.pagination.hasMore, false);
  });
});
