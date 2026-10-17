/**
 * Category merchandising API.
 *
 * Public (no auth):
 *   GET  /api/stores/:id              partner store page
 *   GET  /api/collections/:slug       collection page
 *
 * Admin (ADMIN):
 *   GET/POST          /api/admin/campaigns          ?status=PENDING|APPROVED|REJECTED
 *   PATCH/DELETE      /api/admin/campaigns/:id      (approve/reject via status)
 *   GET/POST          /api/admin/collections        ?category=
 *   PATCH/DELETE      /api/admin/collections/:id
 *   GET               /api/admin/collections/:id/preview
 *
 * Partner (approved vendor):
 *   GET/POST          /api/vendor/campaigns         request a banner (PENDING)
 *   DELETE            /api/vendor/campaigns/:id     withdraw a request
 *
 * What is live is decided in lib/merch.js. Every write pushes
 * `category_updated` so open category pages refresh.
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const {
  campaignCreate, campaignUpdate, vendorCampaignRequest, collectionCreate, collectionUpdate,
} = require('../lib/validators');
const { audit, notify, pushPublic } = require('../lib/notifications');
const {
  serializeCampaign, isInternalLink, resolveCollection, serializeCollection, liveCampaignWhere,
} = require('../lib/merch');
const { slugify } = require('./categories');

const publicRouter = express.Router();
const adminRouter = express.Router();
const vendorRouter = express.Router();

const bad = (res, err) => res.status(400).json({ error: 'INVALID_INPUT', message: err.errors?.[0]?.message || 'Invalid input', details: err.errors });
const toDate = (v) => (v ? new Date(v) : null);
const refresh = (category) => pushPublic('category_updated', JSON.stringify({ name: category }));

async function assertDepartment(category, subcategory) {
  const cat = await prisma.category.findUnique({ where: { name: category }, include: { subcategories: true } });
  if (!cat) return 'CATEGORY_NOT_FOUND';
  if (subcategory && !cat.subcategories.some((s) => s.name === subcategory)) return 'SUBCATEGORY_NOT_FOUND';
  return null;
}

function datesOk(startsAt, endsAt) {
  return !(startsAt && endsAt && new Date(endsAt) < new Date(startsAt));
}

// ---------------------------------------------------------------------------
// Public

publicRouter.get('/stores/:id', async (req, res, next) => {
  try {
    const v = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      select: { id: true, businessName: true, logoUrl: true, bannerUrl: true, description: true, status: true, createdAt: true },
    });
    if (!v || v.status !== 'APPROVED') return res.status(404).json({ error: 'STORE_NOT_FOUND' });
    const products = await prisma.product.findMany({
      where: { vendorId: v.id, status: 'LIVE' },
      select: { category: true, priceCents: true, compareAtPriceCents: true },
    });
    const byCat = new Map();
    for (const p of products) byCat.set(p.category, (byCat.get(p.category) || 0) + 1);
    const { status, ...store } = v;
    res.json({
      store: {
        ...store,
        productCount: products.length,
        dealCount: products.filter((p) => p.compareAtPriceCents > p.priceCents).length,
        categories: [...byCat].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      },
    });
  } catch (err) { next(err); }
});

publicRouter.get('/collections/:slug', async (req, res, next) => {
  try {
    const c = await prisma.collection.findUnique({ where: { slug: req.params.slug } });
    if (!c || !c.isActive) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    const products = await resolveCollection(c, { limit: 60 });
    res.json({ collection: serializeCollection(c, products) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Admin — campaigns

// Auth is attached per route: /api/admin is shared with other routers.
const adminOnly = [requireAuth, requireRole('ADMIN')];

adminRouter.get('/campaigns', adminOnly, async (req, res, next) => {
  try {
    const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status) ? req.query.status : undefined;
    const rows = await prisma.campaign.findMany({
      where: { ...(status ? { status } : {}), ...(req.query.category ? { category: String(req.query.category) } : {}) },
      include: { vendor: true },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const pending = await prisma.campaign.count({ where: { status: 'PENDING' } });
    res.json({ campaigns: rows.map(serializeCampaign), pending });
  } catch (err) { next(err); }
});

adminRouter.post('/campaigns', adminOnly, async (req, res, next) => {
  try {
    const d = campaignCreate.parse(req.body);
    if (!isInternalLink(d.linkUrl)) return res.status(400).json({ error: 'INVALID_LINK', message: 'Link must be a page inside the app, e.g. /categories/beauty or /product/…' });
    if (!datesOk(d.startsAt, d.endsAt)) return res.status(400).json({ error: 'INVALID_DATES', message: 'End date is before the start date.' });
    const deptErr = await assertDepartment(d.category, d.subcategory);
    if (deptErr) return res.status(400).json({ error: deptErr });
    const c = await prisma.campaign.create({
      data: {
        ...d,
        subcategory: d.subcategory || null,
        subtitle: d.subtitle || null,
        imageUrl: d.imageUrl || null,
        startsAt: toDate(d.startsAt),
        endsAt: toDate(d.endsAt),
        status: 'APPROVED',
        createdById: req.user.id,
      },
      include: { vendor: true },
    });
    await audit(req.user.id, { action: 'campaign.create', entityType: 'Campaign', entityId: c.id, meta: { title: c.title, category: c.category } });
    refresh(c.category);
    res.status(201).json({ campaign: serializeCampaign(c) });
  } catch (err) {
    if (err instanceof z.ZodError) return bad(res, err);
    next(err);
  }
});

adminRouter.patch('/campaigns/:id', adminOnly, async (req, res, next) => {
  try {
    const d = campaignUpdate.parse(req.body);
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: { vendor: true } });
    if (!existing) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
    if (d.linkUrl !== undefined && !isInternalLink(d.linkUrl)) return res.status(400).json({ error: 'INVALID_LINK' });
    const startsAt = d.startsAt !== undefined ? d.startsAt : existing.startsAt;
    const endsAt = d.endsAt !== undefined ? d.endsAt : existing.endsAt;
    if (!datesOk(startsAt, endsAt)) return res.status(400).json({ error: 'INVALID_DATES', message: 'End date is before the start date.' });
    if (d.category || d.subcategory !== undefined) {
      const deptErr = await assertDepartment(d.category || existing.category, d.subcategory !== undefined ? d.subcategory : existing.subcategory);
      if (deptErr) return res.status(400).json({ error: deptErr });
    }
    const data = { ...d };
    if (d.startsAt !== undefined) data.startsAt = toDate(d.startsAt);
    if (d.endsAt !== undefined) data.endsAt = toDate(d.endsAt);
    if (d.subcategory !== undefined) data.subcategory = d.subcategory || null;
    const c = await prisma.campaign.update({ where: { id: existing.id }, data, include: { vendor: true } });
    await audit(req.user.id, { action: 'campaign.update', entityType: 'Campaign', entityId: c.id, meta: { changes: Object.keys(d) } });
    // Tell the partner when their request is decided.
    if (existing.vendorId && d.status && d.status !== existing.status && d.status !== 'PENDING') {
      const owner = await prisma.vendor.findUnique({ where: { id: existing.vendorId }, select: { userId: true } });
      if (owner) {
        await notify(owner.userId, {
          kind: 'campaign_reviewed',
          title: d.status === 'APPROVED' ? `Your banner “${c.title}” was approved` : `Your banner “${c.title}” was not approved`,
          body: d.reviewNote || (d.status === 'APPROVED' ? `It will show on the ${c.category} page during its dates.` : 'Open Promotions to see the details.'),
          link: '/promotions',
          meta: { campaignId: c.id, status: d.status },
        });
      }
    }
    refresh(c.category);
    if (existing.category !== c.category) refresh(existing.category);
    res.json({ campaign: serializeCampaign(c) });
  } catch (err) {
    if (err instanceof z.ZodError) return bad(res, err);
    next(err);
  }
});

adminRouter.delete('/campaigns/:id', adminOnly, async (req, res, next) => {
  try {
    const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
    await prisma.campaign.delete({ where: { id: c.id } });
    await audit(req.user.id, { action: 'campaign.delete', entityType: 'Campaign', entityId: c.id, meta: { title: c.title } });
    refresh(c.category);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Admin — collections

async function uniqueSlug(name, ignoreId) {
  const base = slugify(name) || 'collection';
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await prisma.collection.findUnique({ where: { slug } });
    if (!hit || hit.id === ignoreId) return slug;
  }
  return `${base}-${Date.now()}`;
}

adminRouter.get('/collections', adminOnly, async (req, res, next) => {
  try {
    const rows = await prisma.collection.findMany({
      where: req.query.category ? { category: String(req.query.category) } : undefined,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const out = [];
    for (const c of rows) {
      const products = await resolveCollection(c, { limit: 60 });
      out.push({ ...serializeCollection(c), productCount: products.length, preview: products.slice(0, 4).map((p) => ({ id: p.id, name: p.name, imageUrls: p.imageUrls, category: p.category })) });
    }
    res.json({ collections: out });
  } catch (err) { next(err); }
});

adminRouter.get('/collections/:id/preview', adminOnly, async (req, res, next) => {
  try {
    const c = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    res.json({ collection: serializeCollection(c, await resolveCollection(c, { limit: 60 })) });
  } catch (err) { next(err); }
});

function collectionData(d) {
  const data = { ...d };
  if (d.productIds !== undefined) data.productIds = JSON.stringify([...new Set(d.productIds)]);
  if (d.rule !== undefined) data.rule = JSON.stringify(d.rule || {});
  if (d.subcategory !== undefined) data.subcategory = d.subcategory || null;
  return data;
}

adminRouter.post('/collections', adminOnly, async (req, res, next) => {
  try {
    const d = collectionCreate.parse(req.body);
    const deptErr = await assertDepartment(d.category, d.subcategory);
    if (deptErr) return res.status(400).json({ error: deptErr });
    const c = await prisma.collection.create({ data: { ...collectionData(d), slug: await uniqueSlug(d.name) } });
    await audit(req.user.id, { action: 'collection.create', entityType: 'Collection', entityId: c.id, meta: { name: c.name, category: c.category } });
    refresh(c.category);
    res.status(201).json({ collection: serializeCollection(c, await resolveCollection(c)) });
  } catch (err) {
    if (err instanceof z.ZodError) return bad(res, err);
    next(err);
  }
});

adminRouter.patch('/collections/:id', adminOnly, async (req, res, next) => {
  try {
    const d = collectionUpdate.parse(req.body);
    const existing = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    if (d.category || d.subcategory !== undefined) {
      const deptErr = await assertDepartment(d.category || existing.category, d.subcategory !== undefined ? d.subcategory : existing.subcategory);
      if (deptErr) return res.status(400).json({ error: deptErr });
    }
    const data = collectionData(d);
    if (d.name && d.name !== existing.name) data.slug = await uniqueSlug(d.name, existing.id);
    const c = await prisma.collection.update({ where: { id: existing.id }, data });
    await audit(req.user.id, { action: 'collection.update', entityType: 'Collection', entityId: c.id, meta: { changes: Object.keys(d) } });
    refresh(c.category);
    res.json({ collection: serializeCollection(c, await resolveCollection(c)) });
  } catch (err) {
    if (err instanceof z.ZodError) return bad(res, err);
    next(err);
  }
});

adminRouter.delete('/collections/:id', adminOnly, async (req, res, next) => {
  try {
    const c = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'COLLECTION_NOT_FOUND' });
    await prisma.collection.delete({ where: { id: c.id } });
    await audit(req.user.id, { action: 'collection.delete', entityType: 'Collection', entityId: c.id, meta: { name: c.name } });
    refresh(c.category);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Partner — banner requests

// Per route, for the same reason (/api/vendor is shared).
const vendorOnly = [requireAuth, requireApprovedVendor];

vendorRouter.get('/campaigns', vendorOnly, async (req, res, next) => {
  try {
    const rows = await prisma.campaign.findMany({
      where: { vendorId: req.user.vendor.id },
      include: { vendor: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ campaigns: rows.map(serializeCampaign) });
  } catch (err) { next(err); }
});

vendorRouter.post('/campaigns', vendorOnly, async (req, res, next) => {
  try {
    const d = vendorCampaignRequest.parse(req.body);
    if (!datesOk(d.startsAt, d.endsAt)) return res.status(400).json({ error: 'INVALID_DATES', message: 'End date is before the start date.' });
    const deptErr = await assertDepartment(d.category, d.subcategory);
    if (deptErr) return res.status(400).json({ error: deptErr });
    const vendorId = req.user.vendor.id;
    let linkUrl = `/stores/${vendorId}`;
    if (d.target === 'product') {
      const product = d.productId && await prisma.product.findUnique({ where: { id: d.productId }, select: { vendorId: true, status: true } });
      if (!product || product.vendorId !== vendorId) return res.status(403).json({ error: 'NOT_YOUR_PRODUCT', message: 'Banners can only link to your own products.' });
      linkUrl = `/product/${d.productId}`;
    }
    const pendingCount = await prisma.campaign.count({ where: { vendorId, status: 'PENDING' } });
    if (pendingCount >= 5) return res.status(429).json({ error: 'TOO_MANY_PENDING', message: 'You already have 5 banner requests waiting for review.' });
    const c = await prisma.campaign.create({
      data: {
        title: d.title,
        subtitle: d.subtitle || null,
        ctaLabel: d.ctaLabel || 'Shop now',
        imageUrl: d.imageUrl || null,
        category: d.category,
        subcategory: d.subcategory || null,
        startsAt: toDate(d.startsAt),
        endsAt: toDate(d.endsAt),
        linkUrl,
        vendorId,
        status: 'PENDING',
        createdById: req.user.id,
      },
      include: { vendor: true },
    });
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    for (const a of admins) {
      await notify(a.id, {
        kind: 'campaign_requested',
        title: `${c.vendor.businessName} requested a banner: ${c.title}`,
        body: `For the ${c.subcategory ? `${c.category} › ${c.subcategory}` : c.category} page. Review it in Campaigns.`,
        link: '/campaigns?status=PENDING',
        meta: { campaignId: c.id },
      });
    }
    res.status(201).json({ campaign: serializeCampaign(c) });
  } catch (err) {
    if (err instanceof z.ZodError) return bad(res, err);
    next(err);
  }
});

vendorRouter.delete('/campaigns/:id', vendorOnly, async (req, res, next) => {
  try {
    const c = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!c || c.vendorId !== req.user.vendor.id) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
    await prisma.campaign.delete({ where: { id: c.id } });
    refresh(c.category);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { publicRouter, adminRouter, vendorRouter, liveCampaignWhere };
