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

// ---------------------------------------------------------------------------
// Selection for checkout — per-row and bulk.
//
// IMPORTANT ordering note: these two routes (and the helper schemata)
// MUST be declared BEFORE the parameterized PATCH/DELETE /:productId
// below. Express matches in declaration order; if a literal-segment
// route sits after `/:productId`, the parameter route greedily binds
// the literal ("selection" or "items" would parse as a productId and
// fail Number(req.body.quantity) validation with a 400 INVALID_QUANTITY).
// ---------------------------------------------------------------------------

// PATCH /api/cart/items/:cartItemId { selected: boolean }
// Toggle the selectedForCheckout flag for a single row. cartItem.id is
// the canonical stable handle — same product+color pinned to multiple
// sizes is multiple CartItems, and only the id uniquely identifies a
// row. The `where: { id, userId }` ownership check defends against
// user-A poking user-B's row.
const itemSelection = z.object({ selected: z.boolean() });
router.patch('/items/:cartItemId', async (req, res, next) => {
  try {
    const { selected } = itemSelection.parse(req.body);
    const item = await prisma.cartItem.findFirst({
      where: { id: req.params.cartItemId, userId: req.user.id },
    });
    if (!item) return res.status(404).json({ error: 'CART_ITEM_NOT_FOUND' });
    const updated = await prisma.cartItem.update({
      where: { id: item.id },
      data: { selectedForCheckout: selected },
      include: {
        product: { include: { vendor: { select: { id: true, businessName: true } } } },
        variant: true,
      },
    });
    res.json({ item: parseCartItem(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// PATCH /api/cart/selection { selected: boolean }
// Bulk sync every cart row in the current user's cart to the same
// selectedForCheckout value. Drives the Cart page's master
// "Select all" / "Deselect all" checkbox. Single round-trip so the
// UI stays snappy even with 20+ items.
const allSelection = z.object({ selected: z.boolean() });
router.patch('/selection', async (req, res, next) => {
  try {
    const { selected } = allSelection.parse(req.body);
    await prisma.cartItem.updateMany({
      where: { userId: req.user.id },
      data: { selectedForCheckout: selected },
    });
    // Return the freshly-sync'd cart so the caller can re-render
    // without an extra GET.
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
    const variantId = req.body?.variantId || req.query?.variantId || null;
    await prisma.cartItem.deleteMany({
      where: { userId: req.user.id, productId: req.params.productId, variantId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
