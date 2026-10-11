-- Shoe sizes in UK, EU, US and cm (product owner, 2026-10-11), and "forgot password" links.

-- CreateEnum
CREATE TYPE "SizeSystem" AS ENUM ('UK', 'EU', 'US');

-- AlterTable
ALTER TABLE "Shoe" ADD COLUMN     "sizeCm" DECIMAL(4,1),
ADD COLUMN     "sizeEu" DECIMAL(4,1),
ADD COLUMN     "sizeSystem" "SizeSystem" NOT NULL DEFAULT 'UK',
ADD COLUMN     "sizeUk" DECIMAL(4,1),
ADD COLUMN     "sizeUs" DECIMAL(4,1);

-- Existing listings say "UK 9", "EU 42", "US 10" or just "9" (read as UK). Store the system
-- and number, and tidy the label.
UPDATE "Shoe" s
SET "sizeSystem" = COALESCE(UPPER(p.m[1]), 'UK')::"SizeSystem",
    "sizeUk" = CASE WHEN COALESCE(UPPER(p.m[1]), 'UK') = 'UK' THEN p.m[2]::DECIMAL(4,1) END,
    "sizeEu" = CASE WHEN UPPER(p.m[1]) = 'EU' THEN p.m[2]::DECIMAL(4,1) END,
    "sizeUs" = CASE WHEN UPPER(p.m[1]) = 'US' THEN p.m[2]::DECIMAL(4,1) END,
    "size" = COALESCE(UPPER(p.m[1]), 'UK') || ' ' || TRIM_SCALE(p.m[2]::NUMERIC)::TEXT
FROM (
  SELECT id, REGEXP_MATCH(TRIM("size"), '^(UK|EU|US)?\s*(\d{1,2}(?:\.\d)?)$', 'i') AS m
  FROM "Shoe"
) p
WHERE p.id = s.id AND p.m IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Shoe" WHERE "sizeUk" IS NULL AND "sizeEu" IS NULL AND "sizeUs" IS NULL) THEN
    RAISE EXCEPTION 'Some shoe sizes could not be read; change them to e.g. "UK 9" first: %',
      (SELECT STRING_AGG(id || ' = ' || "size", ', ') FROM "Shoe"
       WHERE "sizeUk" IS NULL AND "sizeEu" IS NULL AND "sizeUs" IS NULL);
  END IF;
END $$;

-- The same size in every system, from the chart for who it's for (src/lib/shoe-size.ts): women
-- use the women's chart, men and unisex the men's. Kids' pairs and sizes off the chart keep
-- only the listed system.
WITH chart (chart, uk, eu, us, cm) AS (VALUES
  ('W', 2, 34, 4.5, 21.5),
  ('W', 2.5, 35, 5, 22),
  ('W', 3, 35.5, 5.5, 22.5),
  ('W', 3.5, 36, 6, 23),
  ('W', 4, 37, 6.5, 23),
  ('W', 4.5, 37.5, 7, 23.5),
  ('W', 5, 38, 7.5, 24),
  ('W', 5.5, 38.5, 8, 24),
  ('W', 6, 39, 8.5, 24.5),
  ('W', 6.5, 39.5, 9, 25),
  ('W', 7, 40, 9.5, 25.5),
  ('W', 7.5, 41, 10, 26),
  ('W', 8, 42, 10.5, 26.5),
  ('M', 5, 38, 5.5, 23.5),
  ('M', 5.5, 38.5, 6, 24),
  ('M', 6, 39, 6.5, 24.5),
  ('M', 6.5, 40, 7, 25),
  ('M', 7, 40.5, 7.5, 25.5),
  ('M', 7.5, 41, 8, 26),
  ('M', 8, 42, 8.5, 26.5),
  ('M', 8.5, 42.5, 9, 27),
  ('M', 9, 43, 9.5, 27.5),
  ('M', 9.5, 44, 10, 28),
  ('M', 10, 44.5, 10.5, 28.5),
  ('M', 10.5, 45, 11, 29),
  ('M', 11, 46, 11.5, 29.5),
  ('M', 11.5, 46.5, 12, 30),
  ('M', 12, 47, 12.5, 30.5)
)
UPDATE "Shoe" s
SET "sizeUk" = c.uk, "sizeEu" = c.eu, "sizeUs" = c.us, "sizeCm" = c.cm
FROM chart c
WHERE c.chart = CASE s."audience" WHEN 'WOMEN' THEN 'W' WHEN 'MEN' THEN 'M' WHEN 'UNISEX' THEN 'M' END
  AND CASE s."sizeSystem"
        WHEN 'UK' THEN c.uk = s."sizeUk"
        WHEN 'EU' THEN c.eu = s."sizeEu"
        ELSE c.us = s."sizeUs"
      END;

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
