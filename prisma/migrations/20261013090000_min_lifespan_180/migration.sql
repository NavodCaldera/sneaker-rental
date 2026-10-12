-- The shortest lifespan a merchant may declare defaults to 180 days (was 183). Existing
-- settings rows keep their value; admins change it on /admin/settings.
ALTER TABLE "PricingSettings" ALTER COLUMN "minLifespanDays" SET DEFAULT 180;
