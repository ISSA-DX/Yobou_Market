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
    vendor: user.vendor
      ? {
          id: user.vendor.id,
          businessName: user.vendor.businessName,
          status: user.vendor.status,
        }
      : null,
  };
}

function checkVendorStatus(user, res) {
  if (user.role === 'VENDOR') {
    if (!user.vendor) return res.status(403).json({ error: 'VENDOR_RECORD_MISSING' });
    if (user.vendor.status === 'PENDING') return res.status(403).json({ error: 'VENDOR_PENDING' });
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
