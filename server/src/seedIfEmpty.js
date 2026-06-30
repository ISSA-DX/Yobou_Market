// Seeds the database on boot if it's empty. Used as the start command on
// Render's free tier so the demo accounts and products are available the
// first time the service comes online (and after any deploy that wipes
// the persistent disk — rare, but Render's docs explicitly call it out as
// possible on free-tier restarts).
//
// The check is "is the User table empty?" — that's the cheapest query that
// also proves Prisma can read the DB. If anything goes wrong, we log and
// continue so the server still boots (no products is better than no server).
//
// We also run a small **backfill** on every boot. It's idempotent — the
// curated Category table is populated from the seed categories and from
// any category name that already appears on a live product. On a fresh
// DB this is a no-op (the seed already inserted those rows). On a
// long-running DB where the curated table was missing because of an
// older seed, this repairs the gap.

const { PrismaClient } = require('@prisma/client');
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

const SEED_CATEGORIES = ['Electronics', 'Fashion', 'Home', 'Beauty'];

async function backfillCategories() {
  // Collect every distinct category name that appears on a live product.
  // This repairs older DBs that pre-date the curated Category table
  // feature, where products referenced a free-form category name that
  // the picker doesn't yet know about.
  const liveNames = await prisma.product.findMany({
    where: { status: 'LIVE' },
    select: { category: true },
    distinct: ['category'],
  });
  const productCategories = liveNames.map((p) => p.category).filter(Boolean);
  const wanted = new Set([...SEED_CATEGORIES, ...productCategories]);

  let created = 0;
  for (const name of wanted) {
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) continue;
    const slug = slugify(name);
    if (!slug) continue;
    try {
      await prisma.category.create({
        data: { name, slug, isActive: true },
      });
      created += 1;
    } catch (e) {
      // P2002 (unique constraint) can race if two processes boot at once;
      // safe to ignore here.
      if (e?.code !== 'P2002') throw e;
    }
  }
  if (created > 0) console.log(`[seed] backfill created ${created} categories`);
}

(async () => {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('[seed] DB empty, running seed...');
      // Delegate to the same seed script used by `npm run seed`.
      delete require.cache[require.resolve('../prisma/seed.js')];
      await require('../prisma/seed.js');
      console.log('[seed] done');
    } else {
      console.log(`[seed] DB already has ${userCount} users, skipping full seed`);
    }
    // Always run the category backfill — idempotent.
    await backfillCategories();
  } catch (err) {
    console.error('[seed] failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
