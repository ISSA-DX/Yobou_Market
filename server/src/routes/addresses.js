const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { address } = require('../lib/validators');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    res.json({ addresses });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = address.parse(req.body);
    const created = await prisma.address.create({
      data: { ...data, userId: req.user.id },
    });
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id, id: { not: created.id } },
        data: { isDefault: false },
      });
    }
    res.status(201).json({ address: created });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.patch('/:id/default', async (req, res, next) => {
  try {
    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } }),
      prisma.address.update({ where: { id: req.params.id, userId: req.user.id }, data: { isDefault: true } }),
    ]);
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    res.json({ addresses });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const used = await prisma.order.findFirst({ where: { addressId: req.params.id } });
    if (used) return res.status(409).json({ error: 'ADDRESS_HAS_ORDERS' });
    await prisma.address.delete({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
    next(err);
  }
});

module.exports = router;
