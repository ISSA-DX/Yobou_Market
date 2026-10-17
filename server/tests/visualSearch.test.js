// Search by photo: shopper, admin and partner endpoints, the visual
// matcher, the optional AI description, and the remote-fetch guard.
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const supertest = require('supertest');
const { resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

// A product shot: a coloured shape on a white background.
function shot(color, shape = 'rect') {
  const body = shape === 'circle'
    ? `<circle cx="200" cy="200" r="130" fill="${color}"/>`
    : `<rect x="80" y="110" width="240" height="180" rx="20" fill="${color}"/>`;
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#fff"/>${body}</svg>`)).png().toBuffer();
}

const written = [];
after(() => { for (const f of written) fs.rmSync(f, { force: true }); });

async function uploaded(color, shape) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const name = `test-${crypto.randomBytes(6).toString('hex')}.png`;
  written.push(path.join(UPLOAD_DIR, name));
  fs.writeFileSync(path.join(UPLOAD_DIR, name), await shot(color, shape));
  return `http://localhost:4000/uploads/${name}`;
}

async function makeUser(role) {
  return prisma.user.create({
    data: { email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2)}@test.local`, name: role, passwordHash: 'x', role },
  });
}

async function setup() {
  await prisma.category.create({ data: { name: 'Shoes', slug: 'shoes' } });
  const vendorUser = await makeUser('VENDOR');
  const vendor = await prisma.vendor.create({ data: { userId: vendorUser.id, businessName: 'Acme', phone: '+15555550100', status: 'APPROVED' } });
  const make = async (name, color, shape, extra = {}) => prisma.product.create({
    data: {
      name, description: '', priceCents: 1000, stock: 5, status: 'LIVE', category: 'Shoes',
      imageUrls: JSON.stringify([await uploaded(color, shape)]), ...extra,
    },
  });
  const red = await make('Red Runner Sneaker', '#d91e1e', 'rect', { vendorId: vendor.id });
  const blue = await make('Blue Ball', '#1e4fd9', 'circle');
  const green = await make('Green Tote', '#1ea84a', 'rect');
  const hidden = await make('Red Hidden Draft', '#d91e1e', 'rect', { status: 'HIDDEN' });
  const admin = await makeUser('ADMIN');
  return { red, blue, green, hidden, vendor, adminToken: signAccessFor(admin), vendorToken: signAccessFor(vendorUser) };
}

const send = (app, url, buf, token) => {
  let r = supertest(app).post(url);
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  return r.attach('image', buf, { filename: 'photo.jpg', contentType: 'image/jpeg' });
};

// A phone-ish photo of the red product: slightly off-colour, blurred, cropped.
const redPhoto = async () => sharp(await shot('#c42a22'))
  .extract({ left: 20, top: 30, width: 360, height: 340 }).blur(2).jpeg({ quality: 70 }).toBuffer();

test('photo search — shoppers get the visually closest LIVE products first', async () => {
  await resetTestDb();
  delete process.env.ANTHROPIC_API_KEY;
  const app = getApp();
  const { red, hidden } = await setup();

  const res = await send(app, '/api/search/image', await redPhoto());
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.mode, 'visual');
  assert.strictEqual(res.body.detected, null);
  assert.strictEqual(res.body.products[0].id, red.id);
  assert.ok(Array.isArray(res.body.products[0].imageUrls), 'full product cards');
  assert.ok(!res.body.products.some((p) => p.id === hidden.id), 'hidden products never show');
  assert.ok(await prisma.imageSignature.count() >= 3, 'fingerprints are cached');
});

test('photo search — rejects missing, non-image and unreadable uploads', async () => {
  await resetTestDb();
  const app = getApp();
  assert.strictEqual((await supertest(app).post('/api/search/image')).status, 400);
  const text = await supertest(app).post('/api/search/image').attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
  assert.strictEqual(text.status, 400);
  const junk = await send(app, '/api/search/image', Buffer.from('not really a jpeg'));
  assert.strictEqual(junk.status, 400);
  assert.strictEqual(junk.body.error, 'UNREADABLE_IMAGE');
});

test('photo search — admins search every product, partners only their own', async () => {
  await resetTestDb();
  const app = getApp();
  const { red, hidden, adminToken, vendorToken } = await setup();
  const photo = await redPhoto();

  const admin = await send(app, '/api/admin/products/search-image', photo, adminToken);
  assert.strictEqual(admin.status, 200);
  const adminIds = admin.body.matches.map((m) => m.id);
  assert.ok(adminIds.includes(red.id) && adminIds.includes(hidden.id), 'admin sees hidden products too');

  const vendor = await send(app, '/api/vendor/products/search-image', photo, vendorToken);
  assert.strictEqual(vendor.status, 200);
  assert.deepStrictEqual(vendor.body.matches.map((m) => m.id), [red.id]);

  assert.strictEqual((await send(app, '/api/admin/products/search-image', photo, vendorToken)).status, 403);
  assert.strictEqual((await send(app, '/api/vendor/products/search-image', photo)).status, 401);
});

test('photo search — with an AI key, the described item outranks colour alone', async () => {
  await resetTestDb();
  const app = getApp();
  const { blue } = await setup();
  const realFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let sentModel = null;
  global.fetch = async (url, opts) => {
    assert.strictEqual(String(url), 'https://api.anthropic.com/v1/messages');
    sentModel = JSON.parse(opts.body).model;
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: '{"label":"Blue ball","keywords":["ball"],"category":"Shoes","colors":["blue"]}' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    // A red photo, but the AI says it is a blue ball.
    const res = await send(app, '/api/search/image', await redPhoto());
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.mode, 'ai');
    assert.strictEqual(res.body.detected.label, 'Blue ball');
    assert.strictEqual(res.body.products[0].id, blue.id);
    assert.ok(sentModel);
  } finally {
    global.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('photo search — AI failure falls back to visual matching', async () => {
  await resetTestDb();
  const app = getApp();
  const { red } = await setup();
  const realFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async () => new Response('overloaded', { status: 529 });
  try {
    const res = await send(app, '/api/search/image', await redPhoto());
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.mode, 'visual');
    assert.strictEqual(res.body.products[0].id, red.id);
  } finally {
    global.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('photo search — never fetches product images from private addresses', async () => {
  const { isPrivateAddress, loadImage } = require('../src/lib/visualSearch');
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::1']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  assert.ok(!isPrivateAddress('8.8.8.8'));
  assert.strictEqual(await loadImage('http://127.0.0.1:4000/secret.png'), null);
  assert.strictEqual(await loadImage('/seed-images/../../server/.env'), null);
  assert.strictEqual(await loadImage('file:///etc/passwd'), null);
});
