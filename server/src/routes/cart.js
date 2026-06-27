const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { cartAdd } = require('../lib/validators');
const { requireAuth } = require('../auth/middleware');

const router = express.Router();

function parseImageUrls(product) {
  if (!product || typeof product.imageUrls !== 'string') return product;
  try {
    return { ...product, imageUrls: JSON.parse(product.imageUrls) };
  } catch {
    return { ...product, imageUrls: [] };
  }
}

function parseCartItem(item) {
  return { ...item, product: parseImageUrls(item.product) };
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { product: { include: { vendor: { select: { id: true, businessName: true } } } } },
      orderBy: { id: 'asc' },
    });
    const subtotal = items.reduce((s, i) => s + i.product.priceCents * i.quantity, 0);
    res.json({ items: items.map(parseCartItem), subtotalCents: subtotal });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = cartAdd.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    if (product.status !== 'LIVE') return res.status(400).json({ error: 'PRODUCT_NOT_AVAILABLE' });

    const existing = await prisma.cartItem.findUnique({
      where: { userId_productId: { userId: req.user.id, productId: data.productId } },
    });
    const currentQty = existing?.quantity || 0;
    if (product.stock < currentQty + data.quantity) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        available: product.stock,
        requested: currentQty + data.quantity,
      });
    }

    const item = await prisma.cartItem.upsert({
      where: { userId_productId: { userId: req.user.id, productId: data.productId } },
      update: { quantity: { increment: data.quantity } },
      create: { userId: req.user.id, productId: data.productId, quantity: data.quantity },
      include: { product: { include: { vendor: { select: { id: true, businessName: true } } } } },
    });
    res.status(201).json({ item: parseCartItem(item) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.patch('/:productId', async (req, res, next) => {
  try {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return res.status(400).json({ error: 'INVALID_QUANTITY' });
    }
    if (quantity === 0) {
      await prisma.cartItem.deleteMany({
        where: { userId: req.user.id, productId: req.params.productId },
      });
      return res.json({ ok: true });
    }

    const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    if (quantity > product.stock) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        available: product.stock,
        requested: quantity,
      });
    }

    const item = await prisma.cartItem.update({
      where: { userId_productId: { userId: req.user.id, productId: req.params.productId } },
      data: { quantity },
      include: { product: { include: { vendor: { select: { id: true, businessName: true } } } } },
    });
    res.json({ item: parseCartItem(item) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'CART_ITEM_NOT_FOUND' });
    next(err);
  }
});

router.delete('/:productId', async (req, res, next) => {
  try {
    await prisma.cartItem.deleteMany({
      where: { userId: req.user.id, productId: req.params.productId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
