/**
 * Notification + SSE broadcast helper.
 *
 * This is the single chokepoint for "tell someone something happened."
 * Every server-side mutation that the user might care about — order
 * status changes, vendor decisions, broadcasts — funnels through
 * `notify()` which:
 *   1. Persists a Notification row for inbox display.
 *   2. Pushes it to every live SSE connection for that user.
 *
 * The in-memory `sseClients` map is authoritative for live delivery
 * because broadcast must not wait on a DB write. The SseConnection
 * table mirrors it for observability only.
 */
const { prisma } = require('../prisma');

// userId → Set<res>
const sseClients = new Map();

function registerClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);
  // Best-effort mirror to DB. Don't block the SSE handshake on it.
  prisma.sseConnection
    .create({ data: { userId, role: 'UNKNOWN' } })
    .catch(() => {});
}

function unregisterClient(userId, res) {
  const set = sseClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(userId);
}

function liveClientsFor(userId) {
  return sseClients.get(userId) || new Set();
}

function liveAdminClients() {
  const out = [];
  // We don't carry role on the in-memory map; filter by joining at write
  // time. Admin fan-out uses a separate registry (see below) — this helper
  // is here only for symmetry and future use.
  return out;
}

/**
 * Persistent admin connection registry — separate from sseClients so we
 * can fan out to every admin user without knowing their IDs up front.
 * Keyed by userId for the same fast lookup pattern.
 */
const adminClients = new Map();

// Catalog-broadcast registry — every authenticated client subscribes to
// this so we can fan out "the catalogue just changed" events (new
// product, category created, etc.) without writing an inbox row per user.
// SSE endpoint registers each connection into both sseClients (for
// per-user notifications) and catalogClients (for catalogue events).
const catalogClients = new Map();

function registerCatalog(userId, res) {
  if (!catalogClients.has(userId)) catalogClients.set(userId, new Set());
  catalogClients.get(userId).add(res);
}

function unregisterCatalog(userId, res) {
  const set = catalogClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) catalogClients.delete(userId);
}

function liveCatalogClients() {
  const out = [];
  for (const set of catalogClients.values()) for (const r of set) out.push(r);
  return out;
}

function registerAdmin(userId, res) {
  if (!adminClients.has(userId)) adminClients.set(userId, new Set());
  adminClients.get(userId).add(res);
}

function unregisterAdmin(userId, res) {
  const set = adminClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) adminClients.delete(userId);
}

function liveAdmins() {
  const out = [];
  for (const set of adminClients.values()) for (const r of set) out.push(r);
  return out;
}

/**
 * Push a "catalog changed" frame to every connected client. The event
 * is sent with `event: catalog` so client-side listeners can branch
 * cleanly without parsing the inbox payload. No DB writes — the client
 * decides whether to refetch based on the frame.
 */
function pushCatalog(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of liveCatalogClients()) {
    try { res.write(payload); } catch { /* drop */ }
  }
}

/**
 * Public alias for code that doesn't need to know the channel name.
 * Currently a thin wrapper around pushCatalog so existing call sites
 * keep their meaning ("a public broadcast, not a personal inbox push").
 */
function pushPublic(event, data) {
  pushCatalog(event, data);
}

/**
 * Notify a single user.
 *
 * Returns the created Notification row (without the SSE push side-effect).
 *
 * @param {string} userId
 * @param {object} payload
 * @param {string} payload.kind       — see Notification.kind enum comment
 * @param {string} payload.title
 * @param {string} payload.body
 * @param {string} [payload.link]
 * @param {object} [payload.meta]     — JSON-serialized into Notification.meta
 */
async function notify(userId, { kind, title, body, link, meta }, client) {
  if (!userId || !kind || !title) return null;
  const db = client || prisma;
  const row = await db.notification.create({
    data: {
      userId,
      kind,
      title,
      body: body || '',
      link: link || null,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
  // Skip push if user opted out of this kind (best-effort).
  const prefs = await db.user
    .findUnique({ where: { id: userId }, select: { notifyOrderUpdates: true, notifyShipping: true, notifyPromotions: true } })
    .catch(() => null);
  if (prefs && shouldSuppress(prefs, kind)) return row;

  pushToUser(userId, row);
  return row;
}

function shouldSuppress(prefs, kind) {
  if (kind === 'order_placed' || kind === 'order_status' || kind === 'order_cancelled' || kind === 'tracking_updated') {
    return prefs.notifyOrderUpdates === false;
  }
  if (kind === 'admin_broadcast') {
    return prefs.notifyPromotions === false;
  }
  // Approval/rejection kinds are critical — never suppress.
  return false;
}

/**
 * Push a persisted notification row to all live SSE connections for a
 * user. We send the full row payload so the client doesn't need to refetch.
 */
function pushToUser(userId, row) {
  const payload = `event: notification\ndata: ${JSON.stringify(row)}\n\n`;
  for (const res of liveClientsFor(userId)) {
    try { res.write(payload); } catch { /* drop */ }
  }
}

/**
 * Fan-out to every connected admin.
 */
function pushToAdmins(row) {
  const payload = `event: notification\ndata: ${JSON.stringify(row)}\n\n`;
  for (const res of liveAdmins()) {
    try { res.write(payload); } catch { /* drop */ }
  }
}

/**
 * Notify every relevant party for an order change.
 *
 * Audience:
 *   - The customer (order.userId)
 *   - Every distinct vendor whose product appears in the order
 *   - Every connected admin
 *
 * `tx` is optional — when provided, all reads and inserts run on that
 * transaction's client so we share a single connection with the caller's
 * $transaction. Without it, the prisma client may pick a fresh connection
 * from the pool whose snapshot is stale relative to the caller's recent
 * commits, causing "Foreign key constraint violated" even when the parent
 * row exists.
 */
async function notifyOrderAudience(order, payload, tx) {
  const db = tx || prisma;
  const { kind, title, body, link, meta } = payload;
  // Customer
  await notify(order.userId, { kind, title, body, link, meta }, db);

  // Vendors — prefer in-hand vendor data.
  const itemProductIds = (order.items || []).map((i) => i.productId).filter(Boolean);
  if (itemProductIds.length > 0) {
    let products;
    const withVendor = (order.items || []).filter((i) => i.product && i.product.vendor);
    if (withVendor.length > 0) {
      products = withVendor.map((i) => ({ vendor: i.product.vendor }));
    } else {
      products = await db.product.findMany({
        where: { id: { in: itemProductIds } },
        select: { vendorId: true, vendor: { select: { userId: true } } },
      });
    }
    const seenVendors = new Set();
    for (const p of products) {
      if (!p.vendor || seenVendors.has(p.vendor.userId)) continue;
      seenVendors.add(p.vendor.userId);
      await notify(p.vendor.userId, {
        kind, title, body, link: link || '/vendor/orders', meta,
      }, db);
    }
  }

  // Admins — broadcast to live admin connections AND write a Notification
  // row for each admin (so offline admins see it in their inbox when
  // they come back).
  const admins = await db.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  });
  for (const a of admins) {
    const row = await db.notification.create({
      data: {
        userId: a.id,
        kind: 'admin_broadcast',
        title,
        body,
        link: link || null,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
    if (shouldSuppress({ notifyOrderUpdates: true, notifyPromotions: true, notifyShipping: true }, kind)) continue;
    // Push only works on the regular client (SSE is process-global), but the
    // read-side row write is already done above on `db`.
    pushToUser(a.id, row);
  }
}

/**
 * Append an entry to the admin audit log. Used by every admin-gated route.
 */
async function audit(actorId, { action, entityType, entityId, meta }) {
  await prisma.adminAuditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId: entityId || null,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}

/**
 * Notify every admin that a vendor has submitted a new ProductChange for
 * approval. The vendor's submission would otherwise sit in the queue with
 * no inbox signal — admins only saw the static badge in the sidebar. This
 * fan-out is what makes the bell ring and gives the admin a one-click
 * deep link to the pre-filtered pending list.
 *
 * Each admin gets a Notification row (so offline admins see it on next
 * login) AND a live SSE push (so online admins see the badge increment
 * without a refresh). The link targets `/changes?status=PENDING` so
 * clicking the bell lands the admin on the approval page directly.
 *
 * Should not be called when the change was created by an admin directly
 * (admin-initiated changes don't need an admin-side inbox ping).
 *
 * @param {object} opts
 * @param {string} opts.changeId       the ProductChange.id
 * @param {string} opts.vendorId       the vendor that submitted
 * @param {'CREATE'|'UPDATE'|'DELETE'} opts.action
 * @param {string|null} opts.productId  null for CREATE since the product
 *                                       doesn't exist yet
 * @param {string|null} opts.productName display name for the title
 * @param {object} [opts.tx]            optional Prisma transaction client
 */
async function notifyAdminsProductChangeSubmitted({
  changeId, vendorId, action, productId, productName, tx,
}) {
  const db = tx || prisma;
  const vendorRow = await db.vendor.findUnique({
    where: { id: vendorId },
    select: { businessName: true },
  });
  const name = productName || (action === 'DELETE' ? 'a product' : 'a new product');
  const actionLabel = action === 'CREATE' ? 'submitted a new product'
                    : action === 'UPDATE' ? 'proposed an edit'
                    : 'requested a removal';
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  for (const a of admins) {
    await notify(a.id, {
      kind: 'product_change_submitted',
      title: `${vendorRow?.businessName || 'A vendor'} ${actionLabel}: ${name}`,
      body: 'Open the change queue to approve or reject.',
      link: '/changes?status=PENDING',
      meta: { changeId, vendorId, action, productId: productId || null },
    }, db);
  }
}

/**
 * Fan-out a product change to admins (inbox row) + every connected client
 * (catalog event). No customer inbox row is written — that would clutter
 * every shopper's inbox with every CRUD. Customers see the event by
 * reacting to the SSE `event: catalog` channel and re-fetching their
 * product list pages.
 *
 * @param {object}   opts
 * @param {'create'|'update'|'delete'} opts.action
 * @param {object}   opts.product   the product row (or what remains of it after a delete)
 * @param {string}   [opts.title]   override default title
 * @param {string}   [opts.body]    override default body
 * @param {string}   [opts.link]    override default link
 * @param {object}   [opts.tx]      optional Prisma transaction client
 */
async function notifyProductChange({ action, product, title, body, link, tx }) {
  const db = tx || prisma;
  const kind = action === 'create' ? 'product_created'
             : action === 'update' ? 'product_updated'
             : action === 'delete' ? 'product_deleted' : null;
  if (!kind || !product) return;

  const meta = { productId: product.id, productName: product.name, category: product.category };
  const defaultTitle = action === 'create' ? `New product: ${product.name}`
                     : action === 'update' ? `Product updated: ${product.name}`
                     : `Product removed: ${product.name}`;
  const defaultLink = action === 'delete' ? '/products' : `/products/${product.id}`;
  const t = title || defaultTitle;
  const b = body || `Catalog changed: ${action} on "${product.name}".`;
  const l = link || defaultLink;

  // 1. Catalog event to every connected client (customer + admin + partner).
  //    No DB row, just an SSE frame. The placement flags are included
  //    so client pages can filter the event without refetching the
  //    full list — a product_created with showOnHome=false shouldn't
  //    trigger a Home-page refetch.
  const catalogPayload = {
    action,
    productId: product.id,
    productName: product.name,
    category: product.category,
    vendorId: product.vendorId || null,
    status: product.status || null,
    priceCents: product.priceCents != null ? product.priceCents : null,
    imageUrls: typeof product.imageUrls === 'string'
      ? safeParseJson(product.imageUrls) || []
      : (product.imageUrls || []),
    stock: product.stock != null ? product.stock : null,
    // Placement flags. Defaults match the Product schema defaults so
    // an older product row that somehow lacks the column (shouldn't
    // happen post-migration, but defensive) still produces a coherent
    // event frame.
    showOnHome:       product.showOnHome       != null ? product.showOnHome       : true,
    showOnDeals:      product.showOnDeals      != null ? product.showOnDeals      : true,
    showOnFlashDeals: product.showOnFlashDeals != null ? product.showOnFlashDeals : false,
    showOnSearch:     product.showOnSearch     != null ? product.showOnSearch     : true,
  };
  pushCatalog('catalog', { event: kind, ...catalogPayload });

  // 1b. When the product carries a variant list, also fire a dedicated
  //     catalog frame so list pages subscribed via the variants-specific
  //     SSE channel can refetch without parsing the catalogue payload.
  //     No inbox row — same as the main catalog event.
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    pushCatalog('catalog', {
      event: 'product_variants_changed',
      productId: product.id,
      variants: product.variants.map((v) => ({
        id: v.id, color: v.color, size: v.size, stock: v.stock,
      })),
    });
  }

  // 2. Inbox rows for admins (so the bell increments and they can audit).
  const admins = await db.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  for (const a of admins) {
    const row = await db.notification.create({
      data: { userId: a.id, kind, title: t, body: b, link: l, meta: JSON.stringify(meta) },
    });
    pushToUser(a.id, row);
  }

  // 3. Vendor owner — only when the product belongs to a vendor (i.e.
  //    the change was approved from a vendor's submission). Admins
  //    writing a Yobou-Direct product have no vendor to ping.
  if (product.vendor?.userId) {
    const row = await db.notification.create({
      data: { userId: product.vendor.userId, kind, title: t, body: b, link: l, meta: JSON.stringify(meta) },
    });
    pushToUser(product.vendor.userId, row);
  }
}

function safeParseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/**
 * Notify every connected client that a product's reviews changed.
 * Reviews are not in the inbox — they're a derived, public count, and
 * the PDP refetches on its own. The SSE frame just nudges any other
 * open surface (a list page, a related-products rail, a cart-side
 * "X% of buyers liked this" badge, if we add one) to refetch.
 *
 * No DB writes.
 */
function notifyReviewChange({ productId, action }) {
  if (!productId) return;
  pushCatalog('catalog', { event: 'reviews_changed', productId, action });
}

/**
 * Notify many users in one call. Used by /api/admin/broadcast.
 *
 * Returns { created: number, suppressed: number } so the caller can
 * surface fan-out totals in the audit log and the response.
 */
async function notifyMany(userIds, payload) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { created: 0, suppressed: 0 };
  }
  // Persist all rows in a single createMany call.
  const data = userIds.map((userId) => ({
    userId,
    kind: payload.kind,
    title: payload.title,
    body: payload.body || '',
    link: payload.link || null,
    meta: payload.meta ? JSON.stringify(payload.meta) : null,
  }));
  const result = await prisma.notification.createMany({ data });
  // Best-effort live push to the last few recipients so a fresh SSE
  // connection immediately sees the notification. We re-read the most
  // recent rows for each user to send a real Notification payload
  // (with the auto-generated id and createdAt).
  // For broadcasts with very large audiences this would be expensive;
  // we cap the live push to the first 50 users.
  const recipientsForPush = userIds.slice(0, 50);
  const recent = await prisma.notification.findMany({
    where: { userId: { in: recipientsForPush } },
    orderBy: { createdAt: 'desc' },
    take: recipientsForPush.length,
  });
  for (const row of recent) {
    pushToUser(row.userId, row);
  }
  return { created: result.count };
}

module.exports = {
  registerClient,
  unregisterClient,
  registerAdmin,
  unregisterAdmin,
  registerCatalog,
  unregisterCatalog,
  liveClientsFor,
  liveAdmins,
  notify,
  notifyMany,
  pushToUser,
  pushToAdmins,
  pushCatalog,
  pushPublic,
  notifyOrderAudience,
  notifyProductChange,
  notifyAdminsProductChangeSubmitted,
  notifyReviewChange,
  audit,
};