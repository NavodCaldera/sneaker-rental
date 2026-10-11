-- Customers give their date of birth at sign-up, so we know their age (worked out from it,
-- so it never goes stale). Existing accounts have none.
ALTER TABLE "User" ADD COLUMN "dateOfBirth" DATE;
