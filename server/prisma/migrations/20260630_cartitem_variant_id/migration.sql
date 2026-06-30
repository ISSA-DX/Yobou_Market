-- Add CartItem.variantId so the shopper can pin a cart row to a
-- specific (color, size) row of a product with variants. NULL on the
-- legacy single-stock products — the existing rows are unaffected.
--
-- The @@unique(userId, productId) constraint is widened to
-- (userId, productId, variantId) so a shopper can keep separate cart
-- rows for the same product in different sizes.

ALTER TABLE "CartItem" ADD COLUMN "variantId" TEXT;
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");
-- Drop the old unique constraint first; SQLite requires drop + add.
DROP INDEX IF EXISTS "CartItem_userId_productId_key";
CREATE UNIQUE INDEX "CartItem_userId_productId_variantId_key"
    ON "CartItem"("userId", "productId", "variantId");
