const { execSync } = require('child_process');
const path = require('path');

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
    prisma.timelineEvent.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.cartItem.deleteMany(),
    prisma.productChange.deleteMany(),
    prisma.product.deleteMany(),
    prisma.address.deleteMany(),
    prisma.vendor.deleteMany(),
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

module.exports = { setupTestDb, getApp, TEST_DB, resetTestDb, prisma };
