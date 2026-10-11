-- Customers give their age (whole years) at sign-up instead of a date of birth (product
-- owner, 2026-10-11). Dates of birth already given become today's age.
ALTER TABLE "User" ADD COLUMN "age" INTEGER;
UPDATE "User"
SET "age" = DATE_PART('year', AGE((NOW() AT TIME ZONE 'Asia/Colombo')::date, "dateOfBirth"))::INTEGER
WHERE "dateOfBirth" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "dateOfBirth";
