-- A pair can be made for several experiences (product owner, 2026-10-12): the single
-- "experience" becomes the list "experiences", keeping each pair's current one.
ALTER TABLE "Shoe" ADD COLUMN "experiences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Shoe" SET "experiences" = ARRAY["experience"];
ALTER TABLE "Shoe" ALTER COLUMN "experiences" DROP DEFAULT;
ALTER TABLE "Shoe" DROP COLUMN "experience";

-- Brand and model are optional; an empty field is stored as "".
ALTER TABLE "Shoe" ALTER COLUMN "brand" SET DEFAULT '';
ALTER TABLE "Shoe" ALTER COLUMN "model" SET DEFAULT '';
