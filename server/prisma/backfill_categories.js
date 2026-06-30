// One-shot data backfill: ensure the curated Category table is populated
// for existing databases that pre-date the curated-category feature.
//
// The full `npm run seed` wipes every table and re-seeds from scratch —
// that would destroy all the vendor products, customer orders, variants,
// and cart items accumulated on Render. This script only touches the
// Category table, adding any of the seed categories (or live product
// category names) that are missing. Idempotent: running it twice is a
// no-op.
//
// Pulls the curated list from the categories route helper so the
// standalone script stays in lockstep with the boot-time backfill
// and the in-app POST /api/categories/backfill endpoint.
//
// Run from server/ with the production DATABASE_URL pointed at Render:
//   node prisma/backfill_categories.js

const { PrismaClient } = require('@prisma/client');
const { SEED_CATEGORIES } = require('../src/routes/categories');

const prisma = new PrismaClient();

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function main() {
  console.log('Backfilling curated Category table...');

  // Also collect any category name that already appears on a live
  // product but isn't yet in the Category table. Without this, a
  // product with category "Outdoor Gear" added via the legacy free-form
  // input would never show up in the picker after the curated
  // Category feature shipped. We add it as active so it's immediately
  // selectable.
  const liveNames = await prisma.product.findMany({
    where: { status: 'LIVE' },
    select: { category: true },
    distinct: ['category'],
  });
  const productCategories = liveNames.map((p) => p.category).filter(Boolean);

  const toAdd = new Set([...SEED_CATEGORIES, ...productCategories]);

  let created = 0;
  let skipped = 0;
  for (const name of toAdd) {
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) {
      skipped += 1;
      continue;
    }
    const slug = slugify(name);
    if (!slug) continue;
    await prisma.category.create({
      data: { name, slug, isActive: true },
    });
    created += 1;
    console.log(`  + ${name} (slug=${slug})`);
  }

  const total = await prisma.category.count();
  console.log(`Done. created=${created} skipped=${skipped} total=${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
