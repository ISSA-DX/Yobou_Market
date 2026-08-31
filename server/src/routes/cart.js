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
      include: { product: { include: { vendor: { select: { id: true, businessName: true, status: true } } } } },
      orderBy: { id: 'asc' },
    });
    const subtotal = items.reduce((s, i) => s + i.product.priceCents * i.quantity, 0);
    res.json({ items: items.map(parseCartItem), subtotalCents: subtotal });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = cartAdd.parse(req.body);
    const product = await prisma.product.findUnique({
      where: { id: data.productId },
      include: { variants: true },
    });
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
    if (product.status !== 'LIVE') return res.status(400).json({ error: 'PRODUCT_NOT_AVAILABLE' });

    let availableStock = product.stock;
    let variant = null;
    if (data.variantId) {
      variant = await prisma.productVariant.findUnique({ where: { id: data.variantId } });
      if (!variant || variant.productId !== product.id) {
        return res.status(400).json({ error: 'INVALID_VARIANT' });
      }
      availableStock = variant.stock;
    }

    const existing = await prisma.cartItem.findFirst({
      where: { userId: req.user.id, productId: data.productId, variantId: data.variantId || null },
    });
    const currentQty = existing?.quantity || 0;
    if (availableStock < currentQty + data.quantity) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        available: availableStock,
        requested: currentQty + data.quantity,
      });
    }

    let item;
    if (existing) {
      item = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + data.quantity },
        include: { product: { include: { vendor: { select: { id: true, businessName: true, status: true } } } } },
      });
    } else {
      item = await prisma.cartItem.create({
        data: {
          userId: req.user.id,
          productId: data.productId,
          variantId: data.variantId || null,
          quantity: data.quantity,
        },
        include: { product: { include: { vendor: { select: { id: true, businessName: true, status: true } } } } },
      });
    }
    res.status(201).json({ item: parseCartItem(item) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.patch('/:productId', async (req, res, next) => {
  try {
    const quantity = Number(req.body?.quantity);
    const variantId = req.body?.variantId || null;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return res.status(400).json({ error: 'INVALID_QUANTITY' });
    }

    const product = await prisma.product.findUnique({ where: { id: req.params.productId }, include: { variants: true } });
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });

    let availableStock = product.stock;
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || variant.productId !== product.id) {
        return res.status(400).json({ error: 'INVALID_VARIANT' });
      }
      availableStock = variant.stock;
    }

    if (quantity === 0) {
      await prisma.cartItem.deleteMany({
        where: { userId: req.user.id, productId: req.params.productId, variantId },
      });
      return res.json({ ok: true });
    }

    if (quantity > availableStock) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        available: availableStock,
        requested: quantity,
      });
    }

    const existing = await prisma.cartItem.findFirst({
      where: { userId: req.user.id, productId: req.params.productId, variantId },
    });
    if (!existing) return res.status(404).json({ error: 'CART_ITEM_NOT_FOUND' });

    const item = await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity },
      include: { product: { include: { vendor: { select: { id: true, businessName: true, status: true } } } } },
    });
    res.json({ item: parseCartItem(item) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'CART_ITEM_NOT_FOUND' });
    next(err);
  }
});

router.delete('/:productId', async (req, res, next) => {
  try {
    const variantId = req.body?.variantId || req.query?.variantId || null;
    await prisma.cartItem.deleteMany({
      where: { userId: req.user.id, productId: req.params.productId, variantId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
