const { test } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { request, resetTestDb, prisma, signAccessFor, getApp } = require('./helper');

async function makeUser(role = 'CUSTOMER', extras = {}) {
  const bcrypt = require('bcrypt');
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      name: `${role} Test`,
      passwordHash: await bcrypt.hash('Password123!', 4),
      role,
      ...extras,
    },
  });
}

const tokenFrom = (mail) => /token=([A-Za-z0-9_-]+)/.exec(mail.text)[1];

test('forgot/reset password — emails a single-use link, new password works, old sessions die', async () => {
  await resetTestDb();
  const app = getApp();
  const { outbox } = require('../src/lib/mailer');
  outbox.length = 0;
  const user = await makeUser();
  const oldToken = signAccessFor(user);
  // Make sure the old token's iat is strictly before the reset.
  await new Promise((r) => setTimeout(r, 1100));

  const unknown = await request(app, 'POST', '/api/auth/forgot-password', { body: { email: 'nobody@test.local' } });
  assert.strictEqual(unknown.status, 200); // never reveals whether the email exists
  assert.strictEqual(outbox.length, 0);

  await request(app, 'POST', '/api/auth/forgot-password', { body: { email: user.email.toUpperCase() } });
  assert.strictEqual(outbox.length, 1);
  assert.match(outbox[0].text, /localhost:5173\/reset-password\?token=/);
  const token = tokenFrom(outbox[0]);
  const row = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
  assert.notStrictEqual(row.tokenHash, token, 'only a hash is stored');

  const weak = await request(app, 'POST', '/api/auth/reset-password', { body: { token, password: 'short' } });
  assert.strictEqual(weak.status, 400);
  const ok = await request(app, 'POST', '/api/auth/reset-password', { body: { token, password: 'BrandNew123!' } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  const reuse = await request(app, 'POST', '/api/auth/reset-password', { body: { token, password: 'Another123!' } });
  assert.strictEqual(reuse.body.error, 'RESET_TOKEN_INVALID');

  const login = await request(app, 'POST', '/api/auth/login', { body: { email: user.email, password: 'BrandNew123!' } });
  assert.strictEqual(login.status, 200);
  const stale = await request(app, 'GET', '/api/auth/me', { token: oldToken });
  assert.strictEqual(stale.status, 401, 'session from before the reset is revoked');
});

test('reset links expire and only the newest one works; vendors/couriers get the partner app link', async () => {
  await resetTestDb();
  const app = getApp();
  const { outbox } = require('../src/lib/mailer');
  outbox.length = 0;
  const driver = await makeUser('DRIVER');
  await request(app, 'POST', '/api/auth/forgot-password', { body: { email: driver.email } });
  await request(app, 'POST', '/api/auth/forgot-password', { body: { email: driver.email } });
  assert.match(outbox[1].text, /5176\/partner\/reset-password/);
  const first = tokenFrom(outbox[0]);
  const second = tokenFrom(outbox[1]);
  assert.strictEqual((await request(app, 'POST', '/api/auth/reset-password', { body: { token: first, password: 'Whatever123!' } })).body.error, 'RESET_TOKEN_INVALID');
  await prisma.passwordResetToken.updateMany({ where: { userId: driver.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.strictEqual((await request(app, 'POST', '/api/auth/reset-password', { body: { token: second, password: 'Whatever123!' } })).body.error, 'RESET_TOKEN_INVALID');
});

test('admin can issue a reset link for support; non-admins cannot', async () => {
  await resetTestDb();
  const app = getApp();
  const admin = await makeUser('ADMIN');
  const customer = await makeUser();
  const r = await request(app, 'POST', `/api/admin/users/${customer.id}/password-reset`, { token: signAccessFor(admin) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /reset-password\?token=/);
  assert.strictEqual(r.body.expiresInMinutes, 30);
  const denied = await request(app, 'POST', `/api/admin/users/${admin.id}/password-reset`, { token: signAccessFor(customer) });
  assert.strictEqual(denied.status, 403);
});

test('change password keeps this session (fresh tokens) but revokes older ones', async () => {
  await resetTestDb();
  const app = getApp();
  const user = await makeUser();
  const old = signAccessFor(user);
  await new Promise((r) => setTimeout(r, 1100));
  const r = await request(app, 'POST', '/api/auth/change-password', { token: old, body: { currentPassword: 'Password123!', newPassword: 'Changed123!' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.accessToken);
  assert.strictEqual((await request(app, 'GET', '/api/auth/me', { token: r.body.accessToken })).status, 200);
  assert.strictEqual((await request(app, 'GET', '/api/auth/me', { token: old })).status, 401);
});

test('login lockout — 5 wrong passwords lock the account; correct password then blocked', async () => {
  await resetTestDb();
  const app = getApp();
  const { loginGuard } = require('../src/lib/rateLimit');
  loginGuard.reset();
  const user = await makeUser();
  for (let i = 0; i < 5; i += 1) {
    const r = await request(app, 'POST', '/api/auth/login', { body: { email: user.email, password: 'wrong-password' } });
    assert.strictEqual(r.status, 401);
  }
  const locked = await request(app, 'POST', '/api/auth/login', { body: { email: user.email, password: 'Password123!' } });
  assert.strictEqual(locked.status, 429);
  assert.strictEqual(locked.body.error, 'TOO_MANY_ATTEMPTS');
  loginGuard.reset();
});

test('rate limiter — returns 429 with Retry-After once the window is exhausted', async () => {
  const { rateLimit } = require('../src/lib/rateLimit');
  const app = express();
  app.get('/x', rateLimit({ name: 't', windowMs: 60_000, max: 2, force: true }), (_req, res) => res.json({ ok: true }));
  assert.strictEqual((await request(app, 'GET', '/x')).status, 200);
  assert.strictEqual((await request(app, 'GET', '/x')).status, 200);
  const third = await request(app, 'GET', '/x');
  assert.strictEqual(third.status, 429);
  assert.ok(Number(third.headers['retry-after']) > 0);
});

test('registration records Terms of Service consent when accepted', async () => {
  await resetTestDb();
  const app = getApp();
  const r = await request(app, 'POST', '/api/auth/register', {
    body: { name: 'Awa', email: 'awa@test.local', password: 'Password123!', acceptTerms: true },
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  const u = await prisma.user.findUnique({ where: { email: 'awa@test.local' } });
  assert.ok(u.acceptedTermsAt);
  assert.strictEqual(u.termsVersion, '2026-10');
});
