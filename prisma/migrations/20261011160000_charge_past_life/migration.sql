-- Wear past a pair's lifespan L is charged at the end-of-life price P(L) per wear-day until
-- the pair is returned, even past the target R (pricing-spec.md product decision 8). Part of
-- each shoe's settings snapshot; existing versions get it too, as decided for all pairs.
ALTER TABLE "PricingSettings" ADD COLUMN "chargePastLife" BOOLEAN NOT NULL DEFAULT true;
