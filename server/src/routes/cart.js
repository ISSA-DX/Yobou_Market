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
      include: {
        product: { include: { vendor: { select: { id: true, businessName: true } } } },
        variant: true,
      },
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

    // When the client supplied a variantId, scope the stock check to
    // that row so the cart never accepts more than the picked color/size
    // has. Falls back to Product.stock for legacy products.
    let stockAvailable = product.stock;
    let variant = null;
    if (data.variantId) {
      variant = await prisma.productVariant.findUnique({ where: { id: data.variantId } });
      if (!variant || variant.productId !== product.id) {
        return res.status(400).json({ error: 'INVALID_VARIANT' });
      }
      stockAvailable = variant.stock;
    }

    // findFirst (not findUnique) because SQLite + Prisma 5 don't accept
    // `null` inside a composite-unique where — we want a unique key
    // (userId, productId, variantId) but variantId is nullable. Using
    // findUnique would explode when variantId is null; findFirst is
    // safe and the underlying index still keeps it O(1).
    const existing = await prisma.cartItem.findFirst({
      where: {
        userId: req.user.id,
        productId: data.productId,
        variantId: data.variantId || null,
      },
    });
    const currentQty = existing?.quantity || 0;
    if (stockAvailable < currentQty + data.quantity) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        available: stockAvailable,
        requested: currentQty + data.quantity,
      });
    }

    // Same reason: build the upsert key manually with findFirst + create
    // or update. findUnique's null-in-where is what triggered the bug.
    let item;
    if (existing) {
      item = await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: data.quantity } },
        include: {
          product: { include: { vendor: { select: { id: true, businessName: true } } } },
          variant: true,
        },
      });
    } else {
      item = await prisma.cartItem.create({
        data: {
          userId: req.user.id,
          productId: data.productId,
          variantId: data.variantId || null,
          quantity: data.quantity,
        },
        include: {
          product: { include: { vendor: { select: { id: true, businessName: true } } } },
          variant: true,
        },
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
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return res.status(400).json({ error: 'INVALID_QUANTITY' });
    }
    // Optional variantId — when the cart row is pinned to a specific
    // (color, size) variant we need it in the lookup key. Old callers
    // that omit it still work because the @@unique includes null.
    const variantId = req.body?.variantId || null;
    const whereKey = {
      userId: req.user.id,
      productId: req.params.productId,
      variantId,
    };
    if (quantity === 0) {
      await prisma.cartItem.deleteMany({ where: whereKey });
      return res.json({ ok: true });
    }

    const product = await prisma.product.findUnique({ where: { id: req.params.productId } });
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });

    // Stock check against the variant when one is selected, else Product.stock.
    let stockAvailable = product.stock;
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || variant.productId !== product.id) {
        return res.status(400).json({ error: 'INVALID_VARIANT' });
      }
      stockAvailable = variant.stock;
    }
    if (quantity > stockAvailable) {
      return res.status(400).json({
        error: 'INSUFFICIENT_STOCK',
        available: stockAvailable,
        requested: quantity,
      });
    }

    const item = await prisma.cartItem.findFirst({
      where: whereKey,
      include: {
        product: { include: { vendor: { select: { id: true, businessName: true } } } },
        variant: true,
      },
    });
    if (!item) return res.status(404).json({ error: 'CART_ITEM_NOT_FOUND' });
    const updated = await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity },
      include: {
        product: { include: { vendor: { select: { id: true, businessName: true } } } },
        variant: true,
      },
    });
    res.json({ item: parseCartItem(updated) });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'CART_ITEM_NOT_FOUND' });
    next(err);
  }
});

router.delete('/:productId', async (req, res, next) => {
  try {
    // When the caller specifies ?variantId=... in the query string
    // (or in the JSON body), only delete that specific row. Without
    // it, deletes all variants of the product for this user — old
    // behaviour preserved for Cart.jsx callers that don't know about
    // variants yet.
    const variantId = req.query?.variantId || req.body?.variantId || null;
    if (variantId === null) {
      await prisma.cartItem.deleteMany({
        where: { userId: req.user.id, productId: req.params.productId },
      });
    } else {
      await prisma.cartItem.deleteMany({
        where: { userId: req.user.id, productId: req.params.productId, variantId },
      });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
