// Sample catalogue — fills every subcategory with example products so the
// storefront looks complete while real sellers onboard.
//
//   npm run seed:demo            add the sample products (idempotent)
//   npm run seed:demo -- --remove   take them all down again
//
// Everything is listed under one clearly named seller, "Yobou Sample
// Store" (demo-store@yobou.test, no usable password), so admins can see
// at a glance which listings are examples. --remove deletes the sample
// products that were never ordered and hides (status HIDDEN) any that were.
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { DEMO_CATALOG } = require('./demoCatalog');
const { writeDemoImages, imageFile } = require('./demoImages');

const prisma = new PrismaClient();
const STORE_EMAIL = 'demo-store@yobou.test';
const STORE_NAME = 'Yobou Sample Store';

// Deterministic pseudo-random so re-runs produce the same catalogue.
function seeded(str) {
  return crypto.createHash('md5').update(str).digest().readUInt32BE(0) / 0xffffffff;
}

async function ensureStore() {
  let user = await prisma.user.findUnique({ where: { email: STORE_EMAIL }, include: { vendor: true } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: STORE_EMAIL,
        name: STORE_NAME,
        // Random hash: the account exists only to own the listings.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        role: 'VENDOR',
        vendor: {
          create: {
            businessName: STORE_NAME,
            phone: '+000000000',
            status: 'APPROVED',
            approvedAt: new Date(),
          },
        },
      },
      include: { vendor: true },
    });
  }
  return user.vendor;
}

async function add() {
  const images = writeDemoImages();
  console.log(`[demo] artwork: ${images} images`);
  const vendor = await ensureStore();

  const knownSubs = await prisma.subcategory.findMany({ include: { category: true } });
  const known = new Set(knownSubs.map((s) => `${s.category.name}\u0000${s.name}`));

  let created = 0;
  let skipped = 0;
  const now = Date.now();
  let n = 0;
  for (const [category, subs] of Object.entries(DEMO_CATALOG)) {
    let firstInCategory = true;
    for (const [subcategory, items] of Object.entries(subs)) {
      if (!known.has(`${category}\u0000${subcategory}`)) {
        console.warn(`[demo] "${category} › ${subcategory}" is not a curated subcategory — products still added`);
      }
      for (const [name, priceCents, compareAt, , description] of items) {
        n++;
        const exists = await prisma.product.findFirst({ where: { vendorId: vendor.id, name }, select: { id: true } });
        if (exists) { skipped++; continue; }
        const r = seeded(name);
        const isDeal = compareAt > priceCents;
        // Mostly healthy stock, a few "only N left", the odd sold-out item.
        const stock = r < 0.06 ? 0 : r < 0.2 ? 2 + Math.floor(r * 20) : 15 + Math.floor(r * 85);
        await prisma.product.create({
          data: {
            vendorId: vendor.id,
            name,
            description,
            priceCents,
            compareAtPriceCents: isDeal ? compareAt : null,
            category,
            subcategory,
            imageUrls: JSON.stringify([`/seed-images/demo/${imageFile(category, name)}`]),
            stock,
            status: 'LIVE',
            // Keep Home curated: one sample per category reaches the home feed.
            showOnHome: firstInCategory,
            showOnDeals: isDeal,
            showOnFlashDeals: isDeal && r > 0.5,
            showOnSearch: true,
            showOnRecentDeals: isDeal && r <= 0.5,
            showOnNewArrivals: r > 0.6,
            // Stagger creation times so "Newest" sorting has a real order.
            createdAt: new Date(now - n * 37 * 60 * 1000),
          },
        });
        firstInCategory = false;
        created++;
      }
    }
  }
  console.log(`[demo] ${created} sample products added, ${skipped} already present (seller: ${STORE_NAME})`);
}

async function remove() {
  const user = await prisma.user.findUnique({ where: { email: STORE_EMAIL }, include: { vendor: true } });
  if (!user?.vendor) { console.log('[demo] no sample store found'); return; }
  const products = await prisma.product.findMany({
    where: { vendorId: user.vendor.id },
    select: { id: true, _count: { select: { orderItems: true } } },
  });
  const ordered = products.filter((p) => p._count.orderItems > 0).map((p) => p.id);
  const unordered = products.filter((p) => p._count.orderItems === 0).map((p) => p.id);
  await prisma.cartItem.deleteMany({ where: { productId: { in: unordered } } });
  await prisma.productChange.deleteMany({ where: { productId: { in: unordered } } });
  await prisma.product.deleteMany({ where: { id: { in: unordered } } });
  await prisma.product.updateMany({ where: { id: { in: ordered } }, data: { status: 'HIDDEN' } });
  console.log(`[demo] removed ${unordered.length} sample products, hid ${ordered.length} that have orders`);
}

(async () => {
  try {
    if (process.argv.includes('--remove')) await remove();
    else await add();
  } catch (err) {
    console.error('[demo] failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
