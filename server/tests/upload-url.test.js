// Tests that POST /api/products/upload returns an absolute URL — the
// deployed GitHub-Pages admin/partner/shopper apps all render the
// returned URL directly via <img src=...>, and a relative path would
// resolve against the Pages origin (issa-dx.github.io), which doesn't
// serve uploads. The browser then paints a black "broken image"
// square, which is the regression we are guarding against.
//
// We also test that the URL actually serves the file (200 + same
// content-length as uploaded) so future refactors don't silently break
// the round-trip.
const { test } = require('node:test');
const assert = require('node:assert');
const supertest = require('supertest');
const { resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

// 1x1 transparent PNG. Buffer is small enough to ship inline.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function makeAdmin() {
  return prisma.user.create({
    data: {
      email: `admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: 'Admin Test',
      passwordHash: 'x',
      role: 'ADMIN',
    },
  });
}

test('upload — returns an absolute URL built from request headers', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeAdmin();
  const token = signAccessFor(admin);

  // Simulate a proxied request: Render sits behind the app, so we
  // supply x-forwarded-* the same way Render does.
  const res = await supertest(app)
    .post('/api/products/upload')
    .set('Authorization', `Bearer ${token}`)
    .set('Host', 'yobou-api.onrender.com')
    .set('X-Forwarded-Proto', 'https')
    .set('X-Forwarded-Host', 'yobou-api.onrender.com')
    .attach('image', PNG_1X1, { filename: 'tiny.png', contentType: 'image/png' });

  assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  assert.ok(res.body.url, 'response should include a url');
  assert.match(res.body.url, /^https:\/\/yobou-api\.onrender\.com\/uploads\//,
    `url should be absolute and use x-forwarded-host; got: ${res.body.url}`);
});

test('upload — falls back to req.host when no forwarded headers are set', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeAdmin();
  const token = signAccessFor(admin);

  const res = await supertest(app)
    .post('/api/products/upload')
    .set('Authorization', `Bearer ${token}`)
    .set('Host', 'localhost:4000')
    .attach('image', PNG_1X1, { filename: 'tiny.png', contentType: 'image/png' });

  assert.strictEqual(res.status, 200);
  assert.match(res.body.url, /^https?:\/\/localhost:4000\/uploads\//,
    `url should be absolute using Host header; got: ${res.body.url}`);
});

test('upload — returned URL serves the file (200 + same content-length)', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeAdmin();
  const token = signAccessFor(admin);

  const res = await supertest(app)
    .post('/api/products/upload')
    .set('Authorization', `Bearer ${token}`)
    .set('Host', 'localhost:4000')
    .attach('image', PNG_1X1, { filename: 'roundtrip.png', contentType: 'image/png' });

  assert.strictEqual(res.status, 200);
  const url = new URL(res.body.url);
  // Hit the public uploads endpoint using the absolute URL the API
  // returned — proves the URL is reachable from a browser-like client.
  const fileRes = await supertest(app).get(url.pathname);
  assert.strictEqual(fileRes.status, 200, `expected 200 from ${url.pathname}, got ${fileRes.status}`);
  assert.strictEqual(fileRes.body.length, PNG_1X1.length,
    'returned bytes should match the uploaded bytes');
});