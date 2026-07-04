const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { signAccess, signRefresh, verifyRefresh } = require('./jwt');
const { registerCustomer, login } = require('../lib/validators');
const { requireAuth } = require('./middleware');

const router = express.Router();

const REFRESH_COOKIE = 'yobou_rt';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Transfer a guest user's cart into a freshly-logged-in user's cart.
// Keeps the (productId, variantId) row count minimal: existing identical
// rows are incremented (capped at 99 to match cartAdd's validator) and
// the guest rows are deleted. Called from /login when the request had
// a guest refresh cookie. No-op when the cookie sub equals the new
// user.id (the visitor re-logged-in as themselves, not as a new user).
async function transferGuestCart(guestId, newId) {
  if (!guestId || guestId === newId) return 0;
  const items = await prisma.cartItem.findMany({ where: { userId: guestId } });
  if (items.length === 0) return 0;
  for (const item of items) {
    const existing = await prisma.cartItem.findFirst({
      where: {
        userId: newId,
        productId: item.productId,
        variantId: item.variantId || null,
      },
    });
    const mergedQty = Math.min(99, (existing?.quantity || 0) + item.quantity);
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: mergedQty },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          userId: newId,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: Math.min(99, item.quantity),
        },
      });
    }
  }
  await prisma.cartItem.deleteMany({ where: { userId: guestId } });
  return items.length;
}

function setRefreshCookie(res, token) {
  const crossOrigin = !!process.env.CORS_ORIGIN;
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: crossOrigin ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: REFRESH_TTL_MS,
    path: '/api/auth',
  });
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language,
    currency: user.currency,
    theme: user.theme,
    notifyOrderUpdates: user.notifyOrderUpdates,
    notifyPromotions: user.notifyPromotions,
    notifyShipping: user.notifyShipping,
    marketingConsent: user.marketingConsent,
    // Extended vendor summary so the partner profile page can render
    // businessName / phone / categories / licenseUrl without an extra
    // round-trip. `categories` is stored as a JSON string in SQLite —
    // we parse it on the way out so the SPA gets a real array.
    vendor: user.vendor
      ? {
          id: user.vendor.id,
          businessName: user.vendor.businessName,
          status: user.vendor.status,
          phone: user.vendor.phone || null,
          licenseUrl: user.vendor.licenseUrl || null,
          categories: parseCategories(user.vendor.categories),
        }
      : null,
  };
}

function parseCategories(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// checkVendorStatus gates a vendor's session. PENDING is intentionally
// NOT blocked — newly-registered vendors need to log in so they can see
// the "awaiting approval" status page. REJECTED and SUSPENDED are still
// hard blocks: those are terminal statuses that the admin uses to take
// access away.
function checkVendorStatus(user, res) {
  if (user.role === 'VENDOR') {
    if (!user.vendor) return res.status(403).json({ error: 'VENDOR_RECORD_MISSING' });
    if (user.vendor.status === 'REJECTED') return res.status(403).json({ error: 'VENDOR_REJECTED' });
    if (user.vendor.status === 'SUSPENDED') return res.status(403).json({ error: 'VENDOR_SUSPENDED' });
  }
  return null;
}

function checkAccountDisabled(user, res) {
  if (user.disabledAt) {
    return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
  }
  return null;
}

router.post('/register', async (req, res, next) => {
  try {
    const raw = registerCustomer.parse(req.body);
    const data = { ...raw, email: normalizeEmail(raw.email) };
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'EMAIL_TAKEN' });
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: 'CUSTOMER',
      },
      include: { vendor: true },
    });
    setRefreshCookie(res, signRefresh(user));
    res.status(201).json({ accessToken: signAccess(user), user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'EMAIL_TAKEN' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const raw = login.parse(req.body);
    const data = { ...raw, email: normalizeEmail(raw.email) };
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { vendor: true },
    });
    if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

    // Merge any guest-cart sitting in the refresh cookie into this
    // freshly-logged-in user. The visitor was browsing as a guest
    // (POST /api/auth/guest) and added items; signing in should
    // carry those items forward, not strand them on a now-orphan
    // GuestUser row.
    const priorToken = req.cookies?.[REFRESH_COOKIE];
    if (priorToken) {
      try {
        const prior = verifyRefresh(priorToken);
        if (prior?.sub && prior.sub !== user.id) {
          await transferGuestCart(prior.sub, user.id);
        }
      } catch { /* invalid prior token — skip merge */ }
    }

    const disabledError = checkAccountDisabled(user, res);
    if (disabledError) return disabledError;

    const vendorError = checkVendorStatus(user, res);
    if (vendorError) return vendorError;

    setRefreshCookie(res, signRefresh(user));
    res.json({ accessToken: signAccess(user), user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// POST /api/auth/guest — mint a silent guest user so visitors can
// browse, add-to-cart, and reach checkout without an account. We
// auto-create a User row with role=CUSTOMER, a randomly-generated
// email (`guest-<hex>@guest.local`), and an unusable password hash
// (random bytes through bcrypt — bcrypt.compare against a wrong password
// rejects). The refresh cookie is set so subsequent page loads stay
// signed in to the same guest.
//
// Why a real User row (vs. a token-only session): the cart, orders,
// and checkout endpoints all key off `req.user.id`. Creating a row
// means zero frontend branching for the cart flow — guest add-to-cart
// uses the same code path as a logged-in customer. The cost is empty
// User rows in the DB; a 30-day cleanup cron for role=CUSTOMER users
// with no orders is a Phase-2 follow-up.
router.post('/guest', async (_req, res, next) => {
  try {
    const crypto = require('crypto');
    const guestId = crypto.randomBytes(12).toString('hex');
    const email = `guest-${guestId}@guest.local`;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const user = await prisma.user.create({
      data: { email, name: 'Guest', passwordHash, role: 'CUSTOMER' },
      include: { vendor: true },
    });
    setRefreshCookie(res, signRefresh(user));
    res.status(201).json({
      accessToken: signAccess(user),
      user: publicUser(user),
      isGuest: true,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return res.status(401).json({ error: 'NO_REFRESH' });
  try {
    const payload = verifyRefresh(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { vendor: true },
    });
    if (!user) return res.status(401).json({ error: 'USER_GONE' });

    const disabledError = checkAccountDisabled(user, res);
    if (disabledError) return disabledError;

    const vendorError = checkVendorStatus(user, res);
    if (vendorError) return vendorError;

    setRefreshCookie(res, signRefresh(user));
    res.json({ accessToken: signAccess(user), user: publicUser(user) });
  } catch {
    res.status(401).json({ error: 'BAD_REFRESH' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ ok: true });
});

const updateProfile = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  language: z.enum(['en', 'fr', 'es', 'de', 'zh']).optional(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'CAD', 'XOF', 'CNY']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  notifyOrderUpdates: z.boolean().optional(),
  notifyPromotions: z.boolean().optional(),
  notifyShipping: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const data = updateProfile.parse(req.body);
    if (data.email) {
      data.email = normalizeEmail(data.email);
      const existing = await prisma.user.findFirst({
        where: { email: data.email, id: { not: req.user.id } },
      });
      if (existing) return res.status(409).json({ error: 'EMAIL_TAKEN' });
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      include: { vendor: true },
    });
    res.json({ accessToken: signAccess(user), user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'EMAIL_TAKEN' });
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const changePassword = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const data = changePassword.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: 'INVALID_CURRENT_PASSWORD' });
    if (data.currentPassword === data.newPassword) {
      return res.status(400).json({ error: 'PASSWORD_UNCHANGED' });
    }
    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;
