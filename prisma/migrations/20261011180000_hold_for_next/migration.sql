-- A pair whose reserved-next borrower declines an early handover (or doesn't answer) stays
-- with its holder, free, until a new borrower books it (pricing-spec.md §6a). Restores the
-- step 13 rule that 20261011170000_postpaid_rent dropped.
ALTER TABLE "RentalItem" ADD COLUMN "holdForNext" BOOLEAN NOT NULL DEFAULT false;
