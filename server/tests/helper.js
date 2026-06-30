const { execSync } = require('child_process');
const path = require('path');
const supertest = require('supertest');

const TEST_DB = path.resolve(__dirname, '../prisma/test.db');
const SRC_DIR = path.resolve(__dirname, '../src');

function setupTestDb() {
  // Use a separate SQLite file for tests so we don't pollute dev data.
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-must-be-at-least-32-characters-long';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-32-characters-long';
  process.env.NODE_ENV = 'test';

  // Push the schema to the test database.
  execSync('npx prisma db push --skip-generate', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });
}

// Configure the test database as soon as this module is required so that any
// subsequent PrismaClient singleton is created pointing at the test DB.
setupTestDb();

// Load the Prisma singleton after the environment is configured. It will be
// reused by both the tests and the app under test.
const { prisma } = require('../src/prisma');

async function resetTestDb() {
  // Wipe tables in dependency order for a clean slate per test suite.
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.sseConnection.deleteMany(),
    prisma.adminAuditLog.deleteMany(),
    prisma.timelineEvent.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.productChange.deleteMany(),
    prisma.product.deleteMany(),
    prisma.address.deleteMany(),
    prisma.vendor.deleteMany(),
    prisma.category.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

function getApp() {
  // Clear all server source modules from the require cache so the next require
  // gets a fresh app stack while still sharing the same PrismaClient singleton.
  Object.keys(require.cache).forEach((key) => {
    if (key.startsWith(SRC_DIR)) delete require.cache[key];
  });
  return require('../src/index');
}

// Helper: small wrapper around supertest so new tests can write less boilerplate.
//   request(app, 'POST', '/api/orders/abc/cancel', { token, body: {...} })
async function request(app, method, path, { token, body, headers = {} } = {}) {
  let req = supertest(app)[method.toLowerCase()](path);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  if (body !== undefined) req = req.send(body);
  const res = await req;
  return { status: res.status, body: res.body, headers: res.headers };
}

// Helper: sign an access token for an arbitrary user (used to bypass the
// real /api/auth/login flow in unit-style tests).
function signAccessFor(user) {
  // Re-require after getApp() may have cleared the cache.
  const { signAccess } = require('../src/auth/jwt');
  return signAccess(user);
}

module.exports = { setupTestDb, getApp, TEST_DB, resetTestDb, prisma, request, signAccessFor };
