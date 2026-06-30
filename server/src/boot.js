// Boot wrapper — runs the schema migration and seeds the DB if empty,
// then starts the API. Used as the Render start command.
//
// Why this exists:
// 1. Render's persistent disk isn't always mounted by the time
//    `prisma db push` runs (the disk is documented as not accessible
//    during pre-deploy / build phases, and there have been edge
//    cases where it isn't ready at start either). If /var/data
//    isn't writable we transparently fall back to /tmp/yobou-data
//    so the service still boots — the data just won't persist
//    across deploys.
// 2. We also create the upload dir here (it might be on the disk
//    too) and print the resolved paths so the Render logs make it
//    obvious where state lives.
//
// Order: ensure dirs → run prisma db push → seed if empty → start app.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function pickWritableDir(candidates) {
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      // Probe for write permission
      const probe = path.join(dir, '.write-probe');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch (err) {
      console.warn(`[boot] dir ${dir} not writable (${err.code || err.message}); trying next`);
    }
  }
  throw new Error('No writable data directory found. Tried: ' + candidates.join(', '));
}

// Pick the data dir. Order of preference:
//   1. $DATA_DIR env var (set by Render for the persistent disk)
//   2. /var/data (Render's documented mount path for the disk)
//   3. /tmp/yobou-data (always writable, ephemeral)
const DATA_DIR = process.env.DATA_DIR || pickWritableDir([
  '/var/data',
  path.resolve(process.cwd(), 'data'),
  '/tmp/yobou-data',
]);

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? process.env.UPLOAD_DIR
  : path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Update DATABASE_URL so Prisma uses the resolved path. The schema
// uses `env("DATABASE_URL")`, which is read by Prisma at runtime.
const dbFile = path.join(DATA_DIR, 'dev.db');
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.UPLOAD_DIR = UPLOAD_DIR;

console.log(`[boot] DATA_DIR = ${DATA_DIR}`);
console.log(`[boot] UPLOAD_DIR = ${UPLOAD_DIR}`);
console.log(`[boot] DATABASE_URL = ${process.env.DATABASE_URL}`);

try {
  // MIGRATIONS_ENABLED=1 → use `prisma migrate deploy` (production-safe,
  // requires server/prisma/migrations/ to exist and be in sync with the
  // schema). Off → fall back to `prisma db push` (dev convenience).
  // See server/prisma/migrations/20260630_add_product_variants/ for the
  // first migration that introduces the ProductVariant table.
  if (process.env.MIGRATIONS_ENABLED === '1') {
    console.log('[boot] Running prisma migrate deploy (MIGRATIONS_ENABLED=1)...');
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: process.env,
    });
  } else {
    console.log('[boot] Running prisma db push (dev mode)...');
    execSync('npx prisma db push --skip-generate', {
      stdio: 'inherit',
      env: process.env,
    });
  }
} catch (err) {
  console.error('[boot] prisma schema sync failed:', err.message);
  process.exit(1);
}

// Seed if empty
console.log('[boot] Running seedIfEmpty...');
require('./seedIfEmpty.js');

// Boot the API
console.log('[boot] Starting API...');
const app = require('./index.js');
const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`[yobou] api listening on http://localhost:${port}`);
});