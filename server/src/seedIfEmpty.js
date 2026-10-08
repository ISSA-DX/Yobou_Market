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

// Reuse the helper exposed by the categories route so the boot path
// stays in lockstep with the public /api/categories/backfill endpoint.
const categoriesRouter = require('./routes/categories');
const backfillCategories = categoriesRouter.backfillCategories;

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
    const created = await backfillCategories(prisma);
    if (created.length > 0) {
      console.log(`[seed] backfill created ${created.length} categories`);
    }
  } catch (err) {
    console.error('[seed] failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
