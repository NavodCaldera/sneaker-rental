-- Merchants list a shoe once with how many pairs they have in each size (product owner,
-- 2026-10-13). Every pair stays its own Shoe row; pairs listed together share a listingId.

-- AlterTable: each pair listed before this is a listing of its own.
ALTER TABLE "Shoe" ADD COLUMN "listingId" TEXT;
UPDATE "Shoe" SET "listingId" = "id";
ALTER TABLE "Shoe" ALTER COLUMN "listingId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Shoe_listingId_idx" ON "Shoe"("listingId");
