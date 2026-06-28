const express = require('express');
const { z } = require('zod');
const bcrypt = require('bcrypt');
const { prisma } = require('../prisma');
const { vendorRegister, adminVendorCreate } = require('../lib/validators');
const { requireAuth, requireRole } = require('../auth/middleware');
const { notify, audit } = require('../lib/notifications');

const router = express.Router();

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function parseVendor(vendor) {
  if (!vendor || typeof vendor.categories !== 'string') return vendor;
  try {
    return { ...vendor, categories: JSON.parse(vendor.categories) };
  } catch {
    return { ...vendor, categories: [] };
  }
}

// Public — anyone can apply to become a vendor.
router.post('/register', async (req, res, next) => {
  try {
    const raw = vendorRegister.parse(req.body);
    const data = { ...raw, email: normalizeEmail(raw.email) };
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'EMAIL_TAKEN' });
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: 'VENDOR',
        vendor: {
          create: {
            businessName: data.businessName,
            phone: data.phone,
            licenseUrl: data.licenseUrl || null,
            categories: JSON.stringify(data.categories || []),
            status: 'PENDING',
          },
        },
      },
      include: { vendor: true },
    });
    res.status(201).json({
      vendor: parseVendor({
        id: user.vendor.id,
        businessName: user.vendor.businessName,
        status: user.vendor.status,
        categories: user.vendor.categories,
      }),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'EMAIL_TAKEN' });
    next(err);
  }
});

// Admin views the full vendor list.
router.get('/', requireAuth, requireRole('ADMIN'), async (_req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ vendors: vendors.map(parseVendor) });
  } catch (err) { next(err); }
});

// Admin onboards a vendor directly (already APPROVED) with an initial password.
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const raw = adminVendorCreate.parse(req.body);
    const data = { ...raw, email: normalizeEmail(raw.email) };
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'EMAIL_TAKEN' });
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: 'VENDOR',
        vendor: {
          create: {
            businessName: data.businessName,
            phone: data.phone,
            licenseUrl: data.licenseUrl || null,
            categories: JSON.stringify(data.categories || []),
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        },
      },
      include: { vendor: true },
    });
    res.status(201).json({
      vendor: parseVendor({
        ...user.vendor,
        user: { id: user.id, name: user.name, email: user.email },
      }),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    if (err.code === 'P2002') return res.status(409).json({ error: 'EMAIL_TAKEN' });
    next(err);
  }
});

router.patch('/:id/status', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const status = String(req.body?.status);
    if (!['APPROVED', 'REJECTED', 'PENDING', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_STATUS' });
    }
    const before = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });

    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data: {
        status,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      },
    });

    // Notify the vendor user so the in-app inbox + SSE push surfaces the change.
    const vendorUser = await prisma.user.findUnique({
      where: { id: vendor.userId },
      select: { id: true },
    });
    if (vendorUser) {
      const kind = status === 'APPROVED' ? 'vendor_approved'
                 : status === 'REJECTED' ? 'vendor_rejected'
                 : status === 'SUSPENDED' ? 'vendor_status'
                 : 'vendor_status';
      await notify(vendorUser.id, {
        kind,
        title: status === 'APPROVED' ? 'Your vendor account is approved' :
               status === 'REJECTED' ? 'Your vendor application was rejected' :
               status === 'SUSPENDED' ? 'Your vendor account is suspended' :
               'Your vendor account status changed',
        body: `Your account status is now ${status}.`,
        link: '/vendor/dashboard',
        meta: { vendorId: vendor.id, status },
      });
    }

    await audit(req.user.id, {
      action: status === 'APPROVED' ? 'vendor.approve' :
              status === 'REJECTED' ? 'vendor.reject' :
              status === 'SUSPENDED' ? 'vendor.suspend' : 'vendor.status',
      entityType: 'vendor',
      entityId: vendor.id,
      meta: { from: before.status, to: status },
    });

    res.json({ vendor: parseVendor(vendor) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
    next(err);
  }
});

module.exports = router;