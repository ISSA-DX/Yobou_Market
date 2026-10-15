/**
 * Admin-gated API surface — everything requires role=ADMIN.
 *
 * The previous version had only /products, /kpis, /revenue-by-day. This
 * expansion adds the full admin control plane the brief requires:
 *   - /orders                  list + filter + paginate all orders
 *   - /orders/:id              full detail
 *   - /orders/:id              PATCH for shipping-address / tracking edits
 *   - /users                   list users, filter by role
 *   - /users/:id               disable / enable / change role
 *   - /audit-log               read the admin audit trail
 *   - /broadcast               fan-out an in-app message
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireRole } = require('../auth/middleware');
const { parseImageUrls } = require('./products');
const { notifyMany, notifyProductChange, audit } = require('../lib/notifications');
const { issueResetLink } = require('../lib/passwordReset');

const { FLAG_KEYS, normalizeExtraCategories, applyExtraCategories } = require('../lib/placement');
const router = express.Router();

router.use(requireAuth, requireRole('ADMIN'));

// ---------------------------------------------------------------------------
// Products (kept from the original admin surface)
// ---------------------------------------------------------------------------
// Shared filter for the products table, export, and "select all matching".
//   ?q=        name/description/category contains
//   ?status=   LIVE | DRAFT | HIDDEN
//   ?vendor=   vendor id, or "direct" for Yobou Direct (vendorId = null)
//   ?category= exact category name
//   ?stock=    "out" (0) | "low" (1–5)
function productWhere(query) {
  const where = {};
  const q = query.q ? String(query.q).trim() : '';
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
      { category: { contains: q } },
      { id: { contains: q } },
    ];
  }
  if (['LIVE', 'DRAFT', 'HIDDEN'].includes(String(query.status))) where.status = String(query.status);
  if (query.vendor === 'direct') where.vendorId = null;
  else if (query.vendor) where.vendorId = String(query.vendor);
  if (query.category) where.category = String(query.category);
  if (query.stock === 'out') where.stock = 0;
  else if (query.stock === 'low') where.stock = { gte: 1, lte: 5 };
  return where;
}

router.get('/products', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: productWhere(req.query),
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { id: true, businessName: true } },
        extraCategories: { select: { id: true, name: true, subcategory: true } },
        changes: {
          where: { status: 'PENDING' },
          select: { id: true, action: true },
        },
        _count: { select: { variants: true, orderItems: true } },
      },
    });
    res.json({
      products: products.map(({ _count, ...p }) => ({
        ...parseImageUrls(p),
        pendingChanges: p.changes || [],
        variantCount: _count.variants,
        orderCount: _count.orderItems,
      })),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Products — bulk operations (the admin's "database" toolbox).
// Vendors never reach these: everything here is ADMIN-only and applies
// immediately, whereas vendor edits go through the ProductChange queue.
// ---------------------------------------------------------------------------
const productBulk = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setStatus'), ids: z.array(z.string()).min(1).max(1000), value: z.enum(['LIVE', 'DRAFT', 'HIDDEN']) }),
  // value = vendor id, or null to move the products to Yobou Direct.
  z.object({ action: z.literal('assignVendor'), ids: z.array(z.string()).min(1).max(1000), value: z.string().nullable() }),
  z.object({ action: z.literal('setCategory'), ids: z.array(z.string()).min(1).max(1000), value: z.string().trim().min(1).max(80) }),
  // Move products to a category AND department in one step.
  z.object({
    action: z.literal('setDepartment'),
    ids: z.array(z.string()).min(1).max(1000),
    value: z.object({ category: z.string().trim().min(1).max(80), subcategory: z.string().trim().max(80).nullable().optional() }),
  }),
  // Also show products on another category / department page (adds a pin;
  // existing pins are kept), or remove the pin for that category.
  z.object({
    action: z.literal('pin'),
    ids: z.array(z.string()).min(1).max(1000),
    value: z.object({ category: z.string().trim().min(1).max(80), subcategory: z.string().trim().max(80).nullable().optional(), on: z.boolean() }),
  }),
  // Percentage change applied to priceCents, e.g. -10 = 10% off, 5 = +5%.
  z.object({ action: z.literal('adjustPrice'), ids: z.array(z.string()).min(1).max(1000), value: z.number().min(-90).max(500) }),
  // Only applies to products without variants (variant stock is per row).
  z.object({ action: z.literal('setStock'), ids: z.array(z.string()).min(1).max(1000), value: z.number().int().nonnegative() }),
  // Products that appear in past orders are HIDDEN instead of deleted.
  z.object({ action: z.literal('delete'), ids: z.array(z.string()).min(1).max(1000) }),
  // Turn a storefront placement (Home section) on or off for many products.
  z.object({
    action: z.literal('setPlacement'),
    ids: z.array(z.string()).min(1).max(1000),
    value: z.object({
      flag: z.enum(FLAG_KEYS),
      on: z.boolean(),
    }),
  }),
]);

router.post('/products/bulk', async (req, res, next) => {
  try {
    const data = productBulk.parse(req.body);
    const products = await prisma.product.findMany({
      where: { id: { in: data.ids } },
      include: { _count: { select: { variants: true, orderItems: true } } },
    });
    const result = { updated: 0, deleted: 0, hidden: 0, skipped: [] };

    if (data.action === 'assignVendor' && data.value) {
      const vendor = await prisma.vendor.findUnique({ where: { id: data.value } });
      if (!vendor) return res.status(400).json({ error: 'VENDOR_NOT_FOUND' });
      if (vendor.status !== 'APPROVED') return res.status(400).json({ error: 'VENDOR_NOT_APPROVED' });
    }

    const touched = [];
    await prisma.$transaction(async (tx) => {
      for (const p of products) {
        const { _count, ...product } = p;
        if (data.action === 'delete') {
          if (_count.orderItems > 0) {
            touched.push({ action: 'update', product: await tx.product.update({ where: { id: p.id }, data: { status: 'HIDDEN' } }) });
            result.hidden += 1;
          } else {
            await tx.product.delete({ where: { id: p.id } });
            touched.push({ action: 'delete', product });
            result.deleted += 1;
          }
          continue;
        }
        let update;
        if (data.action === 'setStatus') update = { status: data.value };
        else if (data.action === 'assignVendor') update = { vendorId: data.value };
        else if (data.action === 'setCategory') update = { category: data.value, subcategory: null };
        else if (data.action === 'setDepartment') update = { category: data.value.category, subcategory: data.value.subcategory || null };
        else if (data.action === 'pin') {
          const { category, subcategory, on } = data.value;
          const pins = await tx.categoryExtra.findMany({ where: { productId: p.id } });
          const others = pins.filter((x) => x.name.toLowerCase() !== category.toLowerCase());
          const next = normalizeExtraCategories([...others, ...(on ? [{ name: category, subcategory }] : [])]);
          if (on && next.length === others.length) { result.skipped.push({ id: p.id, reason: 'PIN_LIMIT' }); continue; }
          await applyExtraCategories(tx, p.id, next);
          touched.push({ action: 'update', product });
          result.updated += 1;
          continue;
        }
        else if (data.action === 'setPlacement') update = { [data.value.flag]: data.value.on };
        else if (data.action === 'setStock') {
          if (_count.variants > 0) { result.skipped.push({ id: p.id, reason: 'HAS_VARIANTS' }); continue; }
          update = { stock: data.value };
        } else if (data.action === 'adjustPrice') {
          const priceCents = Math.max(0, Math.round(p.priceCents * (1 + data.value / 100)));
          update = { priceCents };
          // Keep the deal invariant (compareAt > price) — drop stale deals.
          if (p.compareAtPriceCents != null && p.compareAtPriceCents <= priceCents) update.compareAtPriceCents = null;
        }
        touched.push({ action: 'update', product: await tx.product.update({ where: { id: p.id }, data: update }) });
        result.updated += 1;
      }
    });

    const missing = data.ids.filter((id) => !products.some((p) => p.id === id));
    for (const id of missing) result.skipped.push({ id, reason: 'NOT_FOUND' });

    await audit(req.user.id, {
      action: 'product.bulk',
      entityType: 'Product',
      entityId: null,
      meta: { op: data.action, value: data.value ?? null, count: data.ids.length, ...result, skipped: result.skipped.length },
    });
    for (const t of touched) await notifyProductChange(t);
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Products — CSV export / import. Columns mirror the Product table so the
// admin can round-trip the catalogue through a spreadsheet.
// ---------------------------------------------------------------------------
const CSV_COLUMNS = ['id', 'name', 'description', 'category', 'priceCents', 'compareAtPriceCents', 'stock', 'status', 'vendorId', 'vendorName', 'imageUrls'];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/products/export', async (req, res, next) => {
  try {
    const rows = await prisma.product.findMany({
      where: productWhere(req.query),
      orderBy: { createdAt: 'desc' },
      include: { vendor: { select: { businessName: true } } },
    });
    const lines = [CSV_COLUMNS.join(',')];
    for (const p of rows) {
      const images = parseImageUrls(p).imageUrls || [];
      lines.push([
        p.id, p.name, p.description, p.category, p.priceCents, p.compareAtPriceCents, p.stock, p.status,
        p.vendorId, p.vendor?.businessName || 'Yobou Direct', images.join('|'),
      ].map(csvCell).join(','));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yobou-products-${stamp}.csv"`);
    res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
  } catch (err) { next(err); }
});

// Rows arrive already parsed from CSV by the admin client (strings or
// numbers). A row with an existing `id` updates that product (only the
// columns present are written); a row without `id` creates a new one.
const intLike = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : Number(v)), z.number().int().nonnegative().optional());
const importRow = z.object({
  id: z.string().trim().optional().transform((v) => v || undefined),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  priceCents: intLike,
  compareAtPriceCents: z.preprocess((v) => (v === '' || v === undefined ? null : v === null ? null : Number(v)), z.number().int().nonnegative().nullable()).optional(),
  stock: intLike,
  status: z.preprocess((v) => (v === '' ? undefined : typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(['LIVE', 'DRAFT', 'HIDDEN']).optional()),
  vendorId: z.string().trim().optional(),
  imageUrls: z.string().optional(),
});
const productImport = z.object({ rows: z.array(z.record(z.any())).min(1).max(1000) });

router.post('/products/import', async (req, res, next) => {
  try {
    const { rows } = productImport.parse(req.body);
    const vendors = await prisma.vendor.findMany({ where: { status: 'APPROVED' }, select: { id: true } });
    const approvedVendorIds = new Set(vendors.map((v) => v.id));
    const result = { created: 0, updated: 0, errors: [] };

    for (let idx = 0; idx < rows.length; idx++) {
      const line = idx + 2; // header is line 1 in the spreadsheet
      const parsed = importRow.safeParse(rows[idx]);
      if (!parsed.success) {
        result.errors.push({ line, message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      const r = parsed.data;
      const data = {};
      for (const k of ['name', 'description', 'category', 'priceCents', 'stock', 'status']) {
        if (r[k] !== undefined) data[k] = r[k];
      }
      if ('compareAtPriceCents' in rows[idx]) data.compareAtPriceCents = r.compareAtPriceCents ?? null;
      if (r.imageUrls !== undefined) {
        data.imageUrls = JSON.stringify(r.imageUrls.split('|').map((u) => u.trim()).filter(Boolean));
      }
      if (r.vendorId !== undefined) {
        if (r.vendorId === '' || r.vendorId.toLowerCase() === 'direct') data.vendorId = null;
        else if (!approvedVendorIds.has(r.vendorId)) {
          result.errors.push({ line, message: `vendorId ${r.vendorId} is not an approved vendor` });
          continue;
        } else data.vendorId = r.vendorId;
      }

      try {
        if (r.id) {
          const existing = await prisma.product.findUnique({
            where: { id: r.id },
            include: { _count: { select: { variants: true } } },
          });
          if (!existing) { result.errors.push({ line, message: `No product with id ${r.id}` }); continue; }
          // Variant stock is managed per row in the product editor.
          if (existing._count.variants > 0) delete data.stock;
          const price = data.priceCents ?? existing.priceCents;
          const compareAt = 'compareAtPriceCents' in data ? data.compareAtPriceCents : existing.compareAtPriceCents;
          if (compareAt != null && compareAt <= price) {
            result.errors.push({ line, message: 'compareAtPriceCents must be greater than priceCents' });
            continue;
          }
          const updated = await prisma.product.update({ where: { id: r.id }, data });
          await notifyProductChange({ action: 'update', product: updated });
          result.updated += 1;
        } else {
          if (!data.name || !data.category || data.priceCents === undefined) {
            result.errors.push({ line, message: 'New products need name, category and priceCents' });
            continue;
          }
          if (data.compareAtPriceCents != null && data.compareAtPriceCents <= data.priceCents) {
            result.errors.push({ line, message: 'compareAtPriceCents must be greater than priceCents' });
            continue;
          }
          const created = await prisma.product.create({ data: { description: '', ...data } });
          await notifyProductChange({ action: 'create', product: created });
          result.created += 1;
        }
      } catch (e) {
        result.errors.push({ line, message: e.message?.split('\n').pop() || 'Write failed' });
      }
    }

    await audit(req.user.id, {
      action: 'product.import',
      entityType: 'Product',
      entityId: null,
      meta: { rows: rows.length, created: result.created, updated: result.updated, errors: result.errors.length },
    });
    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Orders — list with filters + pagination, full detail, generic edit
// ---------------------------------------------------------------------------
const ORDER_STATUSES = ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAYMENT_METHODS = ['CARD', 'PAYPAL', 'COD'];

router.get('/orders', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.status && ORDER_STATUSES.includes(String(req.query.status))) {
      where.status = String(req.query.status);
    }
    if (req.query.paymentMethod && PAYMENT_METHODS.includes(String(req.query.paymentMethod))) {
      where.paymentMethod = String(req.query.paymentMethod);
    }
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.vendorId) {
      // Orders containing at least one product from this vendor.
      where.items = { some: { product: { vendorId: String(req.query.vendorId) } } };
    }
    if (req.query.q) {
      const q = String(req.query.q).trim();
      where.OR = [
        { id: { contains: q } },
        { user: { name: { contains: q } } },
        { user: { email: { contains: q } } },
      ];
    }
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
    }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: { include: { product: true } },
          timeline: { orderBy: { at: 'asc' } },
          refunds: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);
    res.json({ orders: rows, total, limit, offset });
  } catch (err) { next(err); }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: { include: { product: { include: { vendor: { select: { id: true, businessName: true } } } } } },
        timeline: { orderBy: { at: 'asc' } },
        address: true,
        refunds: { orderBy: { createdAt: 'desc' } },
        delivery: { include: { driver: { select: { id: true, name: true, phone: true } } } },
      },
    });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ order });
  } catch (err) { next(err); }
});

// Generic admin-side order edit (tracking, internal notes, address swap).
const adminOrderEdit = z.object({
  trackingNumber: z.string().min(1).max(100).optional(),
  carrier: z.enum(['DHL', 'FedEx', 'UPS', 'USPS', 'YobouDirect', 'Other']).optional(),
  estimatedDelivery: z.string().optional(),
  cancelReason: z.string().min(3).max(500).optional(),
});

router.patch('/orders/:id', async (req, res, next) => {
  try {
    const data = adminOrderEdit.parse(req.body);
    const before = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });

    const updates = {};
    if (data.trackingNumber !== undefined) updates.trackingNumber = data.trackingNumber;
    if (data.carrier !== undefined) updates.carrier = data.carrier;
    if (data.estimatedDelivery !== undefined) updates.estimatedDelivery = new Date(data.estimatedDelivery);
    if (data.cancelReason !== undefined) updates.cancelReason = data.cancelReason;

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: updates,
    });
    await audit(req.user.id, {
      action: 'order.edit',
      entityType: 'order',
      entityId: order.id,
      meta: { fields: Object.keys(updates) },
    });
    res.json({ order });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Users — list / change role / disable
// ---------------------------------------------------------------------------
router.get('/users', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.role) where.role = String(req.query.role);
    if (req.query.q) {
      const q = String(req.query.q).trim();
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
      ];
    }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { vendor: { select: { id: true, businessName: true, status: true } } },
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users: rows.map(({ passwordHash, ...u }) => u), total, limit, offset });
  } catch (err) { next(err); }
});

const adminUserEdit = z.object({
  role: z.enum(['ADMIN', 'VENDOR', 'CUSTOMER', 'DRIVER']).optional(),
  disabled: z.boolean().optional(),
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const data = adminUserEdit.parse(req.body);
    if (data.role === undefined && data.disabled === undefined) {
      return res.status(400).json({ error: 'NO_OP' });
    }
    // Don't allow an admin to demote themselves — at least one ADMIN must remain.
    if (data.role && data.role !== 'ADMIN' && req.user.id === req.params.id) {
      return res.status(400).json({ error: 'CANNOT_DEMOTE_SELF' });
    }
    const updates = {};
    if (data.role !== undefined) updates.role = data.role;
    if (data.disabled !== undefined) updates.disabledAt = data.disabled ? new Date() : null;

    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'NOT_FOUND' });
    if (before.role === 'ADMIN' && data.disabled === true) {
      return res.status(400).json({ error: 'CANNOT_DISABLE_ADMIN' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updates,
      include: { vendor: true },
    });

    await audit(req.user.id, {
      action: data.role ? 'user.role' : 'user.disable',
      entityType: 'user',
      entityId: user.id,
      meta: { from: { role: before.role, disabledAt: before.disabledAt }, to: updates },
    });

    const { passwordHash, ...safe } = user;
    res.json({ user: safe });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Support: email the user a password-reset link and hand the same link to
// the admin (for when the customer is on the phone and email is slow).
router.post('/users/:id/password-reset', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'NOT_FOUND' });
    if (user.disabledAt) return res.status(400).json({ error: 'ACCOUNT_DISABLED' });
    const link = await issueResetLink(user);
    await audit(req.user.id, { action: 'user.password_reset', entityType: 'user', entityId: user.id, meta: { email: user.email } });
    res.json(link);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Audit log — read-only
// ---------------------------------------------------------------------------
router.get('/audit-log', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.action) where.action = String(req.query.action);
    if (req.query.actorId) where.actorId = String(req.query.actorId);
    if (req.query.entityType) where.entityType = String(req.query.entityType);
    if (req.query.entityId) where.entityId = String(req.query.entityId);
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt.gte = new Date(String(req.query.from));
      if (req.query.to) where.createdAt.lte = new Date(String(req.query.to));
    }
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const [rows, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);
    res.json({ entries: rows, total, limit, offset });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Broadcast — fan-out an in-app notification to an audience.
// ---------------------------------------------------------------------------
const broadcastSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(1000),
  audience: z.enum(['all', 'customers', 'vendors', 'admins']),
  link: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Notify selected vendors that a product is live on the customer storefront.
// Used by the admin "post-publish" success page so an admin can choose which
// vendors to ping (the system's notifyProductChange already wrote a baseline
// product_created/updated row, but the admin can re-send with a personal
// message body). Vendor must be APPROVED to receive the message.
// ---------------------------------------------------------------------------
const notifyVendorSchema = z.object({
  vendorUserIds: z.array(z.string().min(1)).min(1).max(500),
  message: z.string().min(1).max(1000),
});

router.post('/products/:id/notify-vendors', async (req, res, next) => {
  try {
    const { vendorUserIds, message } = notifyVendorSchema.parse(req.body);
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, status: true, vendorId: true },
    });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });

    // Only ping approved vendors with an attached vendor row. Blocking the
    // not-yet-approved vendors stops the admin from spamming vendors whose
    // stores aren't live yet.
    const vendors = await prisma.user.findMany({
      where: { id: { in: vendorUserIds }, role: 'VENDOR' },
      select: { id: true, vendor: { select: { status: true } } },
    });
    const eligible = vendors
      .filter((v) => v.vendor && v.vendor.status === 'APPROVED')
      .map((v) => v.id);
    const skipped = vendorUserIds.length - eligible.length;

    if (eligible.length === 0) {
      return res.status(400).json({ error: 'NO_ELIGIBLE_RECIPIENTS', skipped });
    }

    const meta = {
      productId: product.id,
      productName: product.name,
      actorId: req.user.id,
      kind: 'manual_notify',
    };
    const result = await notifyMany(eligible, {
      kind: 'admin_broadcast',
      title: `Heads up: ${product.name} is live`,
      body: message,
      link: `/products/${product.id}`,
      meta,
    });

    await audit(req.user.id, {
      action: 'product.notify_vendors',
      entityType: 'Product',
      entityId: product.id,
      meta: {
        productName: product.name,
        recipientCount: eligible.length,
        skipped,
        messagePreview: message.slice(0, 80),
      },
    });

    res.status(201).json({
      ok: true,
      sent: eligible.length,
      skipped,
      notificationIds: result.created,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// GET /api/admin/vendors — lightweight list for the "notify vendors"
// multi-select on the post-publish page. Returns approved vendors only
// (pending vendors can't act on a publish notification yet).
router.get('/vendors', async (_req, res, next) => {
  try {
    const rows = await prisma.user.findMany({
      where: { role: 'VENDOR', vendor: { status: 'APPROVED' } },
      select: {
        id: true,
        name: true,
        email: true,
        vendor: { select: { id: true, businessName: true, status: true } },
      },
      orderBy: { vendor: { businessName: 'asc' } },
    });
    res.json({ vendors: rows.map((r) => ({
      userId: r.id,
      name: r.name,
      email: r.email,
      vendorId: r.vendor?.id,
      businessName: r.vendor?.businessName || r.name,
    })) });
  } catch (err) { next(err); }
});

router.post('/broadcast', async (req, res, next) => {
  try {
    const data = broadcastSchema.parse(req.body);
    let userIds = [];
    if (data.audience === 'all') {
      const rows = await prisma.user.findMany({ select: { id: true } });
      userIds = rows.map((r) => r.id);
    } else {
      const role = data.audience === 'customers' ? 'CUSTOMER'
                 : data.audience === 'vendors' ? 'VENDOR'
                 : 'ADMIN';
      const rows = await prisma.user.findMany({ where: { role }, select: { id: true } });
      userIds = rows.map((r) => r.id);
    }
    const meta = { broadcastId: `bc_${Date.now()}`, audience: data.audience };
    const result = await notifyMany(userIds, {
      kind: 'admin_broadcast',
      title: data.title,
      body: data.body,
      link: data.link || null,
      meta,
    });
    await audit(req.user.id, {
      action: 'broadcast.send',
      entityType: 'broadcast',
      entityId: meta.broadcastId,
      meta: { audience: data.audience, recipientCount: userIds.length },
    });
    res.status(201).json({ ok: true, recipientCount: userIds.length, created: result.created });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// KPIs + revenue-by-day (kept from the original)
// ---------------------------------------------------------------------------
router.get('/kpis', async (_req, res, next) => {
  try {
    const [orders, revenueAgg, vendors, pendingVendors, pendingChanges, pendingRefunds, customers, openOrders] = await Promise.all([
      prisma.order.count(),
      prisma.order.aggregate({ _sum: { totalCents: true }, where: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } }),
      prisma.vendor.count(),
      prisma.vendor.count({ where: { status: 'PENDING' } }),
      prisma.productChange.count({ where: { status: 'PENDING' } }),
      prisma.refund.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.order.count({ where: { status: { in: ['PROCESSING', 'SHIPPED'] } } }),
    ]);
    res.json({
      totalOrders: orders,
      totalRevenueCents: revenueAgg._sum.totalCents || 0,
      totalVendors: vendors,
      totalCustomers: customers,
      openOrders,
      pendingVendors,
      pendingChanges,
      pendingRefunds,
    });
  } catch (err) { next(err); }
});

router.get('/revenue-by-day', async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
      },
      select: { createdAt: true, totalCents: true },
    });
    const buckets = new Map();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }
    for (const o of orders) {
      const key = o.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + o.totalCents);
    }
    res.json({
      series: Array.from(buckets.entries()).map(([date, cents]) => ({ date, cents })),
    });
  } catch (err) { next(err); }
});

module.exports = router;