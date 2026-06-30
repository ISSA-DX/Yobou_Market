/**
 * Category CRUD.
 *
 * Source of truth for the curated catalogue of product categories. The
 * free-form `Product.category` string column is kept for backward
 * compatibility (and so the existing shopper `CategoryDetail` page
 * `?category=<slug>` continues to work without a migration). New writes
 * should pick a category from this list.
 *
 * Auth model:
 *   - GET is open to any authenticated user (the picker is shared by
 *     customer/partner/admin).
 *   - POST/PATCH/DELETE are ADMIN-only.
 *
 * Soft-delete: when a category still has products pointing at the name,
 * DELETE flips `isActive=false` instead of removing the row. The picker
 * filters inactive rows so they disappear from the UI but existing
 * products still resolve.
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole } = require('../auth/middleware');
const { categoryCreate, categoryUpdate } = require('../lib/validators');
const { audit, pushPublic } = require('../lib/notifications');

const router = express.Router();

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function getCategoryCounts(activeOnly = true) {
  // Counts per category name for LIVE products. Done in one query.
  const groups = await prisma.product.groupBy({
    by: ['category'],
    where: { status: 'LIVE', ...(activeOnly ? {} : {}) },
    _count: { _all: true },
  });
  const out = {};
  for (const g of groups) out[g.category] = g._count._all;
  return out;
}

/**
 * GET /api/categories
 *
 * Query: ?includeInactive=1 to also list archived categories (admin UI).
 *
 * Response: { categories: [{ id, name, slug, isActive, productCount }] }
 *  - productCount counts only LIVE products.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
    const rows = await prisma.category.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      where: includeInactive ? undefined : { isActive: true },
    });
    const counts = await getCategoryCounts();
    res.json({
      categories: rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        isActive: c.isActive,
        productCount: counts[c.name] || 0,
      })),
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/categories
 *
 * Body: { name, slug? } — slug is auto-derived when omitted.
 *
 * Returns: { category: { id, name, slug, isActive, productCount } }
 */
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = categoryCreate.parse(req.body);
    const slug = (data.slug && slugify(data.slug)) || slugify(data.name);
    if (!slug) {
      return res.status(400).json({ error: 'INVALID_SLUG', message: 'Could not derive a URL-safe slug from the name.' });
    }
    try {
      const created = await prisma.category.create({
        data: { name: data.name, slug, isActive: true },
      });
      await audit(req.user.id, {
        action: 'category.create',
        entityType: 'Category',
        entityId: created.id,
        meta: { name: created.name, slug: created.slug },
      });
      // Push a catalog event so any connected client (admin picker,
      // shopper category browser) can refresh without a round-trip.
      pushPublic('category_created', JSON.stringify({
        id: created.id,
        name: created.name,
        slug: created.slug,
        isActive: created.isActive,
        productCount: 0,
      }));
      res.status(201).json({ category: { ...created, productCount: 0 } });
    } catch (e) {
      if (e && e.code === 'P2002') {
        return res.status(409).json({ error: 'CATEGORY_EXISTS', message: 'A category with that name or slug already exists.' });
      }
      throw e;
    }
  } catch (err) {
    if (err && err.name === 'ZodError') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid category payload.', details: err.errors });
    }
    next(err);
  }
});

/**
 * PATCH /api/categories/:id
 *
 * Body: { name?, slug?, isActive? }. Emits audit + catalog event.
 */
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = categoryUpdate.parse(req.body);
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' });
    const patch = {};
    if (data.name) patch.name = data.name;
    if (data.slug) patch.slug = slugify(data.slug);
    if (typeof data.isActive === 'boolean') patch.isActive = data.isActive;
    try {
      const updated = await prisma.category.update({ where: { id: existing.id }, data: patch });
      await audit(req.user.id, {
        action: 'category.update',
        entityType: 'Category',
        entityId: updated.id,
        meta: { changes: patch },
      });
      const counts = await getCategoryCounts();
      const payload = {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        isActive: updated.isActive,
        productCount: counts[updated.name] || 0,
      };
      pushPublic('category_updated', JSON.stringify(payload));
      res.json({ category: payload });
    } catch (e) {
      if (e && e.code === 'P2002') {
        return res.status(409).json({ error: 'CATEGORY_EXISTS', message: 'A category with that name or slug already exists.' });
      }
      throw e;
    }
  } catch (err) {
    if (err && err.name === 'ZodError') {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid category payload.', details: err.errors });
    }
    next(err);
  }
});

/**
 * DELETE /api/categories/:id
 *
 * If any product (LIVE or otherwise) still uses the name → soft-delete
 * (`isActive=false`). Otherwise hard-delete the row. Either way emits
 * audit + catalog event so the picker hides the category everywhere.
 */
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' });
    const productCount = await prisma.product.count({ where: { category: existing.name } });
    let result;
    let action;
    if (productCount > 0) {
      result = await prisma.category.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      action = 'category.archive';
    } else {
      await prisma.category.delete({ where: { id: existing.id } });
      result = { ...existing, isActive: false, _removed: true };
      action = 'category.delete';
    }
    await audit(req.user.id, {
      action,
      entityType: 'Category',
      entityId: existing.id,
      meta: { name: existing.name, hardDelete: action === 'category.delete' },
    });
    pushPublic(action === 'category.archive' ? 'category_archived' : 'category_deleted', JSON.stringify({
      id: existing.id, name: existing.name, hardDelete: action === 'category.delete',
    }));
    res.json({ category: { id: result.id, name: result.name, slug: result.slug, isActive: result.isActive, productCount } });
  } catch (err) { next(err); }
});

module.exports = router;
