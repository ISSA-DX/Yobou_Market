const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { signAccess, signRefresh, verifyRefresh } = require('./jwt');
const { registerCustomer, login } = require('../lib/validators');
const { requireAuth } = require('./middleware');
const { rateLimit, loginGuard } = require('../lib/rateLimit');
const { issueResetLink, consumeResetToken, issuedBeforePasswordChange } = require('../lib/passwordReset');

const router = express.Router();

// Current Terms of Service version (see server/public/terms.html).
const TERMS_VERSION = '2026-10';

// Brute-force / spam protection on the public endpoints.
// Generous per IP: many phones share one carrier IP (CGNAT). Brute force on
// a single account is stopped by loginGuard instead.
const authLimiter = rateLimit({ name: 'auth', windowMs: 15 * 60 * 1000, max: 100 });
const resetLimiter = rateLimit({ name: 'reset', windowMs: 60 * 60 * 1000, max: 10 });
const guestLimiter = rateLimit({ name: 'guest', windowMs: 60 * 60 * 1000, max: 60 });

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
        data: {
          quantity: mergedQty,
          // The destination user's existing selection intent ALWAYS wins.
          // If they had this row unchecked (saved-for-later), it stays
          // unchecked even when the guest's copy was selected — we never
          // silently flip a customer's saved-for-later decision because
          // a guest with a different mind touched the same SKU. An
          // earlier version used `existing.selectedForCheckout ||
          // item.selectedForCheckout`, which had the opposite effect:
          // any checked guest copy would force-check the destination's
          // saved-for-later row. The merge-existing test in
          // cart-selection.test.js guards against the regression.
          selectedForCheckout: existing.selectedForCheckout,
        },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          userId: newId,
          productId: item.productId,
          variantId: item.variantId || null,
          quantity: Math.min(99, item.quantity),
          // Carry over the guest's selection intent — if they
          // deliberately unchecked the row before logging in, the
          // destination cart row stays unchecked.
          selectedForCheckout: item.selectedForCheckout,
        },
      });
    }
  }
  await prisma.cartItem.deleteMany({ where: { userId: guestId } });
  return items.length;
}

// Guest users are real User rows with a generated address — see
// POST /guest. This is the one place that defines what "guest" means.
const GUEST_EMAIL = /^guest-[0-9a-f]+@guest\.local$/;
function isGuestUser(user) {
  return Boolean(user && user.role === 'CUSTOMER' && GUEST_EMAIL.test(user.email || ''));
}

// Move a guest's saved addresses to the account they just signed in to
// or created. The account's own default address stays the default.
async function transferGuestAddresses(guestId, newId) {
  if (!guestId || guestId === newId) return 0;
  const hasOwn = (await prisma.address.count({ where: { userId: newId } })) > 0;
  const moved = await prisma.address.updateMany({
    where: { userId: guestId },
    data: { userId: newId, ...(hasOwn ? { isDefault: false } : {}) },
  });
  return moved.count;
}

// The visitor's current session, read from the refresh cookie. Returns
// null when there is no cookie, it is invalid/expired, or it was revoked
// by a password change.
async function sessionUserFromCookie(req) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return null;
  try {
    const payload = verifyRefresh(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { vendor: true } });
    if (!user || user.disabledAt || issuedBeforePasswordChange(user, payload.iat)) return null;
    return user;
  } catch {
    return null;
  }
}

// When a guest signs in or registers, carry their cart and addresses
// into the account. Only a GUEST's data is ever merged — signing in as
// a second real account on a shared phone must not mix two customers.
async function mergeGuestInto(req, user) {
  const prior = await sessionUserFromCookie(req);
  if (!prior || prior.id === user.id || !isGuestUser(prior)) return;
  await transferGuestCart(prior.id, user.id);
  await transferGuestAddresses(prior.id, user.id);
}

function setRefreshCookie(res, token) {
  // Cross-site cookie policy. When the refresh cookie is issued, every
  // subsequent XHR/fetch from a real client has to carry it back so
  // /api/auth/refresh can mint a new access token before page-level
  // requests 401. On the Android Capacitor WebView the document origin
  // is `https://localhost/` while the API host is
  // `https://yobou-server.onrender.com/` — a CROSS-SITE request from the
  // browser's perspective. With `SameSite=Lax` the browser silently
  // strips the refresh cookie on programmatic fetch() calls (Lax only
  // permits top-level navigation GETs), so the refresh round-trip
  // always returns `BAD_REFRESH` and the user is kicked back to the
  // login screen mid-session. The Yobou fix: in production (or when an
  // explicit CORS_ORIGIN is set) emit `SameSite=None; Secure` which is
  // universally accepted for cross-site XHR/fetch. The HTTP-only +
  // /api/auth path-scoped + 7-day TTL keeps the cookie's blast radius
  // identical to the original `Lax` cookie — only the cross-site
  // delivery rule changes.
  //
  // Browsers reject `SameSite=None` unless the cookie is also `Secure`
  // (HTTPS). So the cross-site policy is only used in production (or a
  // staging host on HTTPS that opts in with CROSS_SITE_COOKIES=1). Local
  // development goes through the Vite proxy — same-site — where `Lax`
  // over plain http is correct. (Previously any CORS_ORIGIN switched dev
  // to `None` without `Secure`, which browsers silently dropped: every
  // page refresh signed the user out.)
  const isProduction = process.env.NODE_ENV === 'production';
  const crossOrigin = isProduction || process.env.CROSS_SITE_COOKIES === '1';
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: crossOrigin ? 'none' : 'lax',
    secure: crossOrigin,
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
    isGuest: isGuestUser(user),
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

// True when checkVendorStatus would refuse this vendor a session.
function isBlockedVendor(user) {
  return user.role === 'VENDOR' && (!user.vendor || ['REJECTED', 'SUSPENDED'].includes(user.vendor.status));
}

function checkAccountDisabled(user, res) {
  if (user.disabledAt) {
    return res.status(403).json({ error: 'ACCOUNT_DISABLED' });
  }
  return null;
}

router.post('/register', authLimiter, async (req, res, next) => {
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
        // Consent is recorded when the client sends it (current apps make
        // the checkbox mandatory; older app versions don't send it).
        ...(req.body?.acceptTerms === true ? { acceptedTermsAt: new Date(), termsVersion: TERMS_VERSION } : {}),
      },
      include: { vendor: true },
    });
    await mergeGuestInto(req, user);
    setRefreshCookie(res, signRefresh(user));
    res.status(201).json({ accessToken: signAccess(user), user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'EMAIL_TAKEN' });
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const raw = login.parse(req.body);
    const data = { ...raw, email: normalizeEmail(raw.email) };
    const lockedFor = loginGuard.isLocked(data.email);
    if (lockedFor) {
      res.set('Retry-After', String(lockedFor));
      return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', retryAfterSec: lockedFor });
    }
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { vendor: true },
    });
    if (!user) {
      loginGuard.fail(data.email);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) {
      loginGuard.fail(data.email);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    loginGuard.succeed(data.email);

    // Carry the guest's cart and addresses into this account (guest
    // sessions only — see mergeGuestInto).
    await mergeGuestInto(req, user);

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
router.post('/guest', guestLimiter, async (req, res, next) => {
  try {
    // Never replace a live session. A page that asks for a guest before
    // the app has finished restoring its session (or two pages asking at
    // once) gets the visitor's CURRENT user back — guest or signed in —
    // instead of a fresh guest that would overwrite the cookie and strand
    // their cart.
    const current = await sessionUserFromCookie(req);
    if (current && !isBlockedVendor(current)) {
      setRefreshCookie(res, signRefresh(current));
      return res.json({
        accessToken: signAccess(current),
        user: publicUser(current),
        isGuest: isGuestUser(current),
        resumed: true,
      });
    }

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
    // A password change/reset signs out every older session.
    if (issuedBeforePasswordChange(user, payload.iat)) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      return res.status(401).json({ error: 'SESSION_REVOKED' });
    }

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
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      // Revokes sessions on other devices; this one gets fresh tokens below.
      data: { passwordHash, passwordChangedAt: new Date() },
      include: { vendor: true },
    });
    setRefreshCookie(res, signRefresh(updated));
    res.json({ ok: true, accessToken: signAccess(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Forgot / reset password. The response never reveals whether an email is
// registered. Links go to the app matching the account's role.
// ---------------------------------------------------------------------------
router.post('/forgot-password', resetLimiter, async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().trim().email().max(200) }).parse(req.body || {});
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (user && !user.disabledAt && !/@guest\.local$/i.test(user.email)) {
      await issueResetLink(user);
    }
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const { token, password } = z.object({
      token: z.string().min(10).max(200),
      password: z.string().min(8).max(128),
    }).parse(req.body || {});
    const user = await consumeResetToken(token, password);
    loginGuard.succeed(user.email); // lift any lockout
    res.json({ ok: true, email: user.email, role: user.role });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.message === 'RESET_TOKEN_INVALID') return res.status(400).json({ error: 'RESET_TOKEN_INVALID' });
    next(err);
  }
});

module.exports = router;
