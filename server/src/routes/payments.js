const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth } = require('../auth/middleware');
const { mobileMoneyMethodCreate, MOBILE_MONEY_PROVIDERS } = require('../lib/validators');
const { maskPhone, verifyCallbackSignature } = require('../lib/mobileMoney');

const router = express.Router();

// Public provider callback — MUST be mounted before requireAuth so providers
// (which cannot send cookies/tokens) can reach it. Protected by signature
// secret instead of session authentication.
router.post('/mobile-money/callback', async (req, res, next) => {
  try {
    const secret = process.env.MOBILE_MONEY_WEBHOOK_SECRET;
    const signature = req.headers['x-provider-signature'];

    // Reject unsigned callbacks in production. In development only, allow a
    // test signature of "dev" so engineers can simulate provider responses.
    const isDev = process.env.NODE_ENV !== 'production';
    if (!secret && !isDev) {
      return res.status(403).json({ error: 'CALLBACK_NOT_CONFIGURED' });
    }
    if (secret && !verifyCallbackSignature(req.body, signature, secret)) {
      return res.status(403).json({ error: 'INVALID_SIGNATURE' });
    }
    if (!secret && signature !== 'dev') {
      return res.status(403).json({ error: 'INVALID_SIGNATURE' });
    }

    const { providerTxnId, status, failureReason } = req.body;
    if (!providerTxnId || !['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_CALLBACK' });
    }

    const txn = await prisma.mobileMoneyTxn.findFirst({
      where: { providerTxnId },
      include: { order: true },
    });
    if (!txn) return res.status(404).json({ error: 'TXN_NOT_FOUND' });

    await prisma.$transaction(async (tx) => {
      await tx.mobileMoneyTxn.update({
        where: { id: txn.id },
        data: { status, failureReason: failureReason || null },
      });

      if (status === 'SUCCESS' && txn.order.status === 'PLACED') {
        await tx.order.update({
          where: { id: txn.order.id },
          data: {
            status: 'PAID',
            timeline: { create: { status: 'PAID', actorRole: 'SYSTEM' } },
          },
        });
      }
    });

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.use(requireAuth);

function detectBrand(number) {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^6(?:011|5)/.test(n)) return 'discover';
  return 'card';
}

const cardCreate = z.object({
  number: z.string().min(12).max(25),
  name: z.string().min(1).max(120),
  expiry: z.string().regex(/^\d{2}\/\d{2}$/),
  cvv: z.string().min(3).max(4),
  isDefault: z.boolean().optional().default(false),
});

router.get('/', async (req, res, next) => {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    res.json({
      methods: methods.map((m) =>
        m.type === 'MOBILE_MONEY' ? { ...m, mobileNumber: maskPhone(m.mobileNumber) } : m
      ),
    });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = cardCreate.parse(req.body);
    const [expiryMonth, expiryYear] = data.expiry.split('/');
    const brand = detectBrand(data.number);
    const last4 = data.number.replace(/\s/g, '').slice(-4);

    if (data.isDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const method = await prisma.paymentMethod.create({
      data: {
        userId: req.user.id,
        type: 'CARD',
        brand,
        last4,
        expiryMonth,
        expiryYear,
        isDefault: data.isDefault,
      },
    });

    res.status(201).json({ method });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.patch('/:id/default', async (req, res, next) => {
  try {
    await prisma.$transaction([
      prisma.paymentMethod.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } }),
      prisma.paymentMethod.update({ where: { id: req.params.id, userId: req.user.id }, data: { isDefault: true } }),
    ]);
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ methods });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.paymentMethod.delete({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Mobile money methods
// ---------------------------------------------------------------------------

router.get('/mobile-money/methods', async (req, res, next) => {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: req.user.id, type: 'MOBILE_MONEY' },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ methods });
  } catch (err) { next(err); }
});

router.post('/mobile-money/methods', async (req, res, next) => {
  try {
    const data = mobileMoneyMethodCreate.parse(req.body);
    const provider = String(data.provider).toUpperCase();
    if (!MOBILE_MONEY_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'INVALID_PROVIDER' });
    }

    if (data.isDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const method = await prisma.paymentMethod.create({
      data: {
        userId: req.user.id,
        type: 'MOBILE_MONEY',
        mobileProvider: provider,
        mobileNumber: data.phone,
        mobileCountry: data.country,
        isDefault: data.isDefault,
      },
    });

    res.status(201).json({
      method: {
        ...method,
        mobileNumber: maskPhone(method.mobileNumber),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

module.exports = router;
