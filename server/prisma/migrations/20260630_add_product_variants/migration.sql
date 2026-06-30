-- Add ProductVariant table + ProductChange variant proposal columns.
--
-- This is the first migration in the project history; prior schema
-- changes used `prisma db push` (see `server/src/boot.js`). Going forward
-- we run `prisma migrate deploy` in production (guarded by
-- MIGRATIONS_ENABLED=1) but keep db push as the dev fallback so `npm run
-- dev` keeps working without bookkeeping.
--
-- SQLite syntax — no IF NOT EXISTS / CREATE INDEX IF NOT EXISTS pre-3.35,
-- but our deploy target (sqlite via better-sqlite3 in Prisma 6.x) ships
-- 3.4x+, so the constraint is fine to use directly.

CREATE TABLE "ProductVariant" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "color"     TEXT NOT NULL,
    "size"      TEXT NOT NULL,
    "stock"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProductVariant_productId_color_size_key"
    ON "ProductVariant"("productId", "color", "size");
CREATE INDEX "ProductVariant_productId_idx"
    ON "ProductVariant"("productId");
