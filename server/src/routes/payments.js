const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

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
    res.json({ methods });
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

module.exports = router;
