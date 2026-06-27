// Seeds the database on boot if it's empty. Used as the start command on
// Render's free tier so the demo accounts and products are available the
// first time the service comes online (and after any deploy that wipes
// the persistent disk — rare, but Render's docs explicitly call it out as
// possible on free-tier restarts).
//
// The check is "is the User table empty?" — that's the cheapest query that
// also proves Prisma can read the DB. If anything goes wrong, we log and
// continue so the server still boots (no products is better than no server).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log(`[seed] DB already has ${userCount} users, skipping seed`);
      return;
    }
    console.log('[seed] DB empty, running seed...');
    // Delegate to the same seed script used by `npm run seed`.
    delete require.cache[require.resolve('../prisma/seed.js')];
    await require('../prisma/seed.js');
    console.log('[seed] done');
  } catch (err) {
    console.error('[seed] failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
