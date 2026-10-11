-- Shop by who a pair is for, then by experience (product owner, 2026-10-11). Replaces the
-- single category. Existing pairs default to Men; merchants can change it on the pair's page.
CREATE TYPE "Audience" AS ENUM ('MEN', 'WOMEN', 'UNISEX', 'BOYS', 'GIRLS');

ALTER TABLE "Shoe" ADD COLUMN "audience" "Audience" NOT NULL DEFAULT 'MEN';
ALTER TABLE "Shoe" ALTER COLUMN "audience" DROP DEFAULT;

ALTER TABLE "Shoe" RENAME COLUMN "category" TO "experience";
UPDATE "Shoe" SET "experience" = CASE "experience"
  WHEN 'Running' THEN 'Morning Run'
  WHEN 'Basketball' THEN 'Game Day'
  WHEN 'Skate' THEN 'Street Session'
  WHEN 'Training' THEN 'Gym Session'
  ELSE 'Weekend Stroll'
END;
