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
const { categoryCreate, categoryUpdate, subcategoryCreate, subcategoryUpdate } = require('../lib/validators');
const { audit, pushPublic } = require('../lib/notifications');
const { CATEGORY_CATALOG, CATEGORY_NAMES } = require('../lib/categoryCatalog');

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

// The curated product categories that ship with every fresh install.
// Derived from server/src/lib/categoryCatalog.js, which also holds the
// editorial content (tagline, subcategories, guide, FAQs) for each.
const SEED_CATEGORIES = CATEGORY_NAMES;

/**
 * Backfill the curated Category table from the seed list and from any
 * category name that already appears on a live product. Idempotent —
 * `findUnique` short-circuits existing rows, and the `create` is
 * guarded against P2002 (race with a concurrent boot backfill).
 *
 * Exposed as `router.backfillCategories` so the admin UI can trigger a
 * one-shot backfill on demand if the table happens to be empty in a
 * given environment (e.g. a Render free-tier redeploy that didn't
 * cycle the process and re-run boot.js).
 */
async function backfillCategories(prisma) {
  const liveNames = await prisma.product.findMany({
    where: { status: 'LIVE' },
    select: { category: true },
    distinct: ['category'],
  });
  const productCategories = liveNames.map((p) => p.category).filter(Boolean);
  const wanted = new Set([...SEED_CATEGORIES, ...productCategories]);

  const created = [];
  for (const name of wanted) {
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) continue;
    const slug = slugify(name);
    if (!slug) continue;
    try {
      const row = await prisma.category.create({
        data: { name, slug, isActive: true },
      });
      created.push(row);
    } catch (e) {
      if (e?.code !== 'P2002') throw e;
    }
  }
  await seedCategoryContent(prisma);
  return created;
}

/**
 * Seed the editorial content + subcategories from the catalogue, once
 * per category. `contentSeededAt` marks a category as seeded, so admin
 * edits (including deleted subcategories) survive every later boot.
 * Fields the admin already filled in are never overwritten.
 */
async function seedCategoryContent(prisma) {
  for (let i = 0; i < CATEGORY_CATALOG.length; i++) {
    const entry = CATEGORY_CATALOG[i];
    const cat = await prisma.category.findUnique({ where: { name: entry.name } });
    if (!cat || cat.contentSeededAt) continue;
    await prisma.category.update({
      where: { id: cat.id },
      data: {
        // Older seeds stored `name.toLowerCase()` as the slug ("tv & audio");
        // normalise to the URL-safe form the shopper links use.
        slug: slugify(cat.slug) === cat.slug ? cat.slug : slugify(entry.name),
        icon: cat.icon || entry.icon,
        tagline: cat.tagline || entry.tagline,
        description: cat.description || entry.description,
        featured: cat.featured || Boolean(entry.featured),
        sortOrder: cat.sortOrder || i + 1,
        guide: cat.guide && cat.guide !== '[]' ? cat.guide : JSON.stringify(entry.guide || []),
        faqs: cat.faqs && cat.faqs !== '[]' ? cat.faqs : JSON.stringify(entry.faqs || []),
        contentSeededAt: new Date(),
      },
    }).catch((e) => {
      // A slug collision with an admin-created row — keep the old slug.
      if (e?.code !== 'P2002') throw e;
    });
    for (let j = 0; j < (entry.subcategories || []).length; j++) {
      const sub = entry.subcategories[j];
      try {
        await prisma.subcategory.create({
          data: {
            categoryId: cat.id,
            name: sub.name,
            slug: slugify(sub.name),
            description: sub.description || '',
            icon: sub.icon || null,
            sortOrder: j + 1,
          },
        });
      } catch (e) {
        if (e?.code !== 'P2002') throw e;
      }
    }
  }
}

function parseJsonArray(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Wire shape shared by the admin, partner and shopper apps.
 * `counts` / `subCounts` come from getCategoryCounts / getSubcategoryCounts.
 */
function serializeCategory(c, counts = {}, subCounts = {}, { includeInactiveSubs = false } = {}) {
  const subs = (c.subcategories || [])
    .filter((s) => includeInactiveSubs || s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      icon: s.icon,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
      heroImageUrl: s.heroImageUrl || null,
      intro: s.intro || null,
      guide: parseJsonArray(s.guide),
      faqs: parseJsonArray(s.faqs),
      productCount: subCounts[`${c.name}\u0000${s.name}`] || 0,
    }));
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    isActive: c.isActive,
    icon: c.icon,
    tagline: c.tagline,
    description: c.description,
    featured: c.featured,
    sortOrder: c.sortOrder,
    guide: parseJsonArray(c.guide),
    faqs: parseJsonArray(c.faqs),
    productCount: counts[c.name] || 0,
    subcategories: subs,
    source: 'curated',
  };
}

async function getSubcategoryCounts() {
  const groups = await prisma.product.groupBy({
    by: ['category', 'subcategory'],
    where: { status: 'LIVE', subcategory: { not: null } },
    _count: { _all: true },
  });
  const out = {};
  for (const g of groups) out[`${g.category}\u0000${g.subcategory}`] = g._count._all;
  for (const pin of await livePins()) {
    if (!pin.subcategory) continue;
    if (pin.name === pin.product.category && pin.subcategory === pin.product.subcategory) continue;
    const key = `${pin.name}\u0000${pin.subcategory}`;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

router.backfillCategories = backfillCategories;
router.SEED_CATEGORIES = SEED_CATEGORIES;
router.serializeCategory = serializeCategory;
router.getSubcategoryCounts = getSubcategoryCounts;
router.getCategoryCounts = getCategoryCounts;
router.slugify = slugify;

async function getCategoryCounts(activeOnly = true) {
  // Counts per category name for LIVE products. Done in one query.
  const groups = await prisma.product.groupBy({
    by: ['category'],
    where: { status: 'LIVE', ...(activeOnly ? {} : {}) },
    _count: { _all: true },
  });
  const out = {};
  for (const g of groups) out[g.category] = g._count._all;
  // Products pinned to a category count there too (unless the pin just
  // repeats the product's own category).
  for (const pin of await livePins()) {
    if (pin.name === pin.product.category) continue;
    out[pin.name] = (out[pin.name] || 0) + 1;
  }
  return out;
}

// Category pins on LIVE products, with the product's own placement so
// counts can skip pins that duplicate it. Pilot-scale: one small query.
function livePins() {
  return prisma.categoryExtra.findMany({
    where: { product: { status: 'LIVE' } },
    select: { name: true, subcategory: true, product: { select: { category: true, subcategory: true } } },
  });
}

/**
 * GET /api/categories
 *
 * Query:
 *   ?includeInactive=1 — also list archived categories (admin UI).
 *   ?curatedOnly=1     — only return rows from the curated Category table
 *                       (used by admin pages that manage the table itself).
 *   ?includeLive=1     — (default) also include any free-form category
 *                       names currently in use on LIVE products but not
 *                       yet in the curated table. Marked with
 *                       `source: 'live'` so the picker can badge them.
 *
 * Response: { categories: [{
 *     id, name, slug, isActive, productCount, source: 'curated' | 'live'
 *   }] }
 *  - productCount counts only LIVE products.
 *  - The free-form rows have id=null and slug derived from name.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
    const curatedOnly = req.query.curatedOnly === '1' || req.query.curatedOnly === 'true';
    // Default to true: the picker is the dominant caller, and showing
    // live product categories is the whole point. Admin table-management
    // pages opt out with ?curatedOnly=1.
    const includeLive = curatedOnly
      ? false
      : req.query.includeLive === undefined
        ? true
        : req.query.includeLive === '1' || req.query.includeLive === 'true';

    const rows = await prisma.category.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      where: includeInactive ? undefined : { isActive: true },
      include: { subcategories: true },
    });
    const [counts, subCounts] = await Promise.all([getCategoryCounts(), getSubcategoryCounts()]);

    // Curated rows first.
    const out = rows.map((c) => serializeCategory(c, counts, subCounts, { includeInactiveSubs: includeInactive }));

    if (includeLive) {
      // Pull every distinct category name currently in use on LIVE
      // products, drop any that match a curated row (curated wins —
      // those are the canonical entries), and synthesise a virtual
      // row for the picker. No DB writes here; the next backfill
      // promotes them to curated.
      const liveNames = await prisma.product.findMany({
        where: { status: 'LIVE' },
        select: { category: true },
        distinct: ['category'],
      });
      const curatedNames = new Set(rows.map((r) => r.name.toLowerCase()));
      for (const { category } of liveNames) {
        if (!category) continue;
        if (curatedNames.has(category.toLowerCase())) continue;
        out.push({
          id: null,
          name: category,
          slug: slugify(category),
          isActive: true,
          productCount: counts[category] || 0,
          subcategories: [],
          source: 'live',
        });
      }
      out.sort((a, b) => {
        // Curated first, then by name. Active before inactive within
        // each source.
        if (a.source !== b.source) return a.source === 'curated' ? -1 : 1;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    res.json({ categories: out });
  } catch (err) { next(err); }
});

/**
 * POST /api/categories/backfill
 *
 * One-shot repair endpoint: populates the curated Category table from
 * the seed list and from any category name that already appears on a
 * live product. Idempotent. Admin-only because it mutates global state.
 *
 * Used as a self-heal for environments where boot.js's backfill hasn't
 * run (e.g. Render free-tier redeploys that didn't cycle the process).
 * The admin UI calls this automatically on mount if GET / returns an
 * empty list.
 */
router.post('/backfill', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const created = await backfillCategories(prisma);
    res.json({
      created: created.length,
      categories: created,
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
        source: 'curated',
      }));
      res.status(201).json({ category: serializeCategory({ ...created, subcategories: [] }) });
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
    if (data.icon !== undefined) patch.icon = data.icon || null;
    if (data.tagline !== undefined) patch.tagline = data.tagline || null;
    if (data.description !== undefined) patch.description = data.description || null;
    if (typeof data.featured === 'boolean') patch.featured = data.featured;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    if (data.guide !== undefined) patch.guide = JSON.stringify(data.guide);
    if (data.faqs !== undefined) patch.faqs = JSON.stringify(data.faqs);
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.category.update({ where: { id: existing.id }, data: patch });
        // Keep products attached when the category is renamed — they
        // reference it by name.
        if (patch.name && patch.name !== existing.name) {
          await tx.product.updateMany({ where: { category: existing.name }, data: { category: patch.name } });
        }
        return tx.category.findUnique({ where: { id: row.id }, include: { subcategories: true } });
      });
      await audit(req.user.id, {
        action: 'category.update',
        entityType: 'Category',
        entityId: updated.id,
        meta: { changes: Object.keys(patch) },
      });
      const [counts, subCounts] = await Promise.all([getCategoryCounts(), getSubcategoryCounts()]);
      const payload = serializeCategory(updated, counts, subCounts, { includeInactiveSubs: true });
      pushPublic('category_updated', JSON.stringify({ id: payload.id, name: payload.name, slug: payload.slug, isActive: payload.isActive }));
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
    res.json({ category: { id: result.id, name: result.name, slug: result.slug, isActive: result.isActive, productCount, source: 'curated' } });
  } catch (err) { next(err); }
});

/**
 * Subcategory CRUD — ADMIN-only. Partners pick from these in the
 * product form; shoppers browse them on the category page.
 *
 *   POST   /api/categories/:id/subcategories          { name, description?, icon?, sortOrder? }
 *   PATCH  /api/categories/:id/subcategories/:subId   { name?, description?, icon?, sortOrder?, isActive? }
 *   DELETE /api/categories/:id/subcategories/:subId
 *
 * Renames carry products along (Product.subcategory is a name). DELETE
 * archives (isActive=false) while products still use the subcategory.
 */
async function loadCategoryPayload(id) {
  const row = await prisma.category.findUnique({ where: { id }, include: { subcategories: true } });
  const [counts, subCounts] = await Promise.all([getCategoryCounts(), getSubcategoryCounts()]);
  return serializeCategory(row, counts, subCounts, { includeInactiveSubs: true });
}

function zodError(res, err) {
  return res.status(400).json({ error: 'INVALID_INPUT', message: 'Invalid subcategory payload.', details: err.errors });
}

router.post('/:id/subcategories', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = subcategoryCreate.parse(req.body);
    const cat = await prisma.category.findUnique({ where: { id: req.params.id }, include: { subcategories: true } });
    if (!cat) return res.status(404).json({ error: 'CATEGORY_NOT_FOUND' });
    const slug = slugify(data.name);
    if (!slug) return res.status(400).json({ error: 'INVALID_SLUG', message: 'Could not derive a URL-safe slug from the name.' });
    const nextOrder = data.sortOrder ?? (Math.max(0, ...cat.subcategories.map((s) => s.sortOrder)) + 1);
    try {
      const sub = await prisma.subcategory.create({
        data: { categoryId: cat.id, name: data.name, slug, description: data.description, icon: data.icon || null, sortOrder: nextOrder },
      });
      await audit(req.user.id, {
        action: 'subcategory.create',
        entityType: 'Subcategory',
        entityId: sub.id,
        meta: { category: cat.name, name: sub.name },
      });
    } catch (e) {
      if (e?.code === 'P2002') {
        return res.status(409).json({ error: 'SUBCATEGORY_EXISTS', message: `“${data.name}” already exists in ${cat.name}.` });
      }
      throw e;
    }
    pushPublic('category_updated', JSON.stringify({ id: cat.id, name: cat.name, slug: cat.slug, isActive: cat.isActive }));
    res.status(201).json({ category: await loadCategoryPayload(cat.id) });
  } catch (err) {
    if (err?.name === 'ZodError') return zodError(res, err);
    next(err);
  }
});

router.patch('/:id/subcategories/:subId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const data = subcategoryUpdate.parse(req.body);
    const sub = await prisma.subcategory.findUnique({ where: { id: req.params.subId }, include: { category: true } });
    if (!sub || sub.categoryId !== req.params.id) return res.status(404).json({ error: 'SUBCATEGORY_NOT_FOUND' });
    const patch = {};
    if (data.name) { patch.name = data.name; patch.slug = slugify(data.name); }
    if (data.description !== undefined) patch.description = data.description;
    if (data.icon !== undefined) patch.icon = data.icon || null;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    if (typeof data.isActive === 'boolean') patch.isActive = data.isActive;
    if (data.heroImageUrl !== undefined) patch.heroImageUrl = data.heroImageUrl || null;
    if (data.intro !== undefined) patch.intro = data.intro?.trim() || null;
    if (data.guide !== undefined) patch.guide = JSON.stringify(data.guide);
    if (data.faqs !== undefined) patch.faqs = JSON.stringify(data.faqs);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.subcategory.update({ where: { id: sub.id }, data: patch });
        if (patch.name && patch.name !== sub.name) {
          await tx.product.updateMany({
            where: { category: sub.category.name, subcategory: sub.name },
            data: { subcategory: patch.name },
          });
        }
      });
    } catch (e) {
      if (e?.code === 'P2002') {
        return res.status(409).json({ error: 'SUBCATEGORY_EXISTS', message: `“${data.name}” already exists in ${sub.category.name}.` });
      }
      throw e;
    }
    await audit(req.user.id, {
      action: 'subcategory.update',
      entityType: 'Subcategory',
      entityId: sub.id,
      meta: { category: sub.category.name, name: sub.name, changes: Object.keys(patch) },
    });
    const c = sub.category;
    pushPublic('category_updated', JSON.stringify({ id: c.id, name: c.name, slug: c.slug, isActive: c.isActive }));
    res.json({ category: await loadCategoryPayload(c.id) });
  } catch (err) {
    if (err?.name === 'ZodError') return zodError(res, err);
    next(err);
  }
});

router.delete('/:id/subcategories/:subId', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  try {
    const sub = await prisma.subcategory.findUnique({ where: { id: req.params.subId }, include: { category: true } });
    if (!sub || sub.categoryId !== req.params.id) return res.status(404).json({ error: 'SUBCATEGORY_NOT_FOUND' });
    const inUse = await prisma.product.count({ where: { category: sub.category.name, subcategory: sub.name } });
    if (inUse > 0) {
      await prisma.subcategory.update({ where: { id: sub.id }, data: { isActive: false } });
    } else {
      await prisma.subcategory.delete({ where: { id: sub.id } });
    }
    await audit(req.user.id, {
      action: inUse > 0 ? 'subcategory.archive' : 'subcategory.delete',
      entityType: 'Subcategory',
      entityId: sub.id,
      meta: { category: sub.category.name, name: sub.name, productCount: inUse },
    });
    const c = sub.category;
    pushPublic('category_updated', JSON.stringify({ id: c.id, name: c.name, slug: c.slug, isActive: c.isActive }));
    res.json({ archived: inUse > 0, productCount: inUse, category: await loadCategoryPayload(c.id) });
  } catch (err) { next(err); }
});

module.exports = router;
