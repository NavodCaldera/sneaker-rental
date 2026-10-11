-- Merchants declare a pair's condition when listing it: brand new, second-hand, or
-- second-hand with upgrades (and what was upgraded). Existing pre-worn listings are
-- second-hand.
CREATE TYPE "ShoeCondition" AS ENUM ('NEW', 'SECOND_HAND', 'SECOND_HAND_UPGRADED');
ALTER TABLE "Shoe" ADD COLUMN "condition" "ShoeCondition" NOT NULL DEFAULT 'NEW',
ADD COLUMN "upgradeNotes" TEXT;
UPDATE "Shoe" SET "condition" = 'SECOND_HAND' WHERE "initialWear" > 0;
