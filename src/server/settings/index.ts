import "server-only";
import { z } from "zod";
import type { PricingSettings as PricingSettingsRow } from "@/generated/prisma/client";
import { D } from "@/lib/decimal";
import { type PricingSettings } from "@/lib/pricing";
import { db } from "../db";

export type SettingsRow = PricingSettingsRow;

/** The active settings row: the latest with effectiveFrom ≤ now. */
export async function getActiveSettings(now = new Date()): Promise<SettingsRow> {
  const row = await db.pricingSettings.findFirst({
    where: { effectiveFrom: { lte: now } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  if (!row) throw new Error("No pricing settings found. Run `npm run db:seed`.");
  return row;
}

/**
 * Map a stored row to the pricing engine's input (Decimal strings, never JS numbers).
 * Price a listed shoe with its own snapshot (`shoe.settings`), not the active row.
 */
export function toPricingSettings(row: SettingsRow): PricingSettings {
  return {
    merchantMargin: row.merchantMargin.toString(),
    platformMargin: row.platformMargin.toString(),
    floor: row.floor.toString(),
    midpointRatio: row.midpointRatio.toString(),
    baseSteepness: row.baseSteepness.toString(),
    refLife: row.refLife,
    minLife: row.minLifespanDays,
    maxLife: row.maxLifespanDays,
    maxDiscount: row.maxDiscount.toString(),
    releaseLeadDays: row.releaseLeadDays,
    releaseDiscountStep: row.releaseDiscountStep.toString(),
    catchUp: row.catchUpEnabled,
    chargePastLife: row.chargePastLife,
    capitalRate: row.capitalRate.toString(),
    holdCostPerDay: row.holdCost.toString(),
  };
}

const RATIO = /^\d+(\.\d+)?$/;
const ratio = z.string().trim().regex(RATIO, "Enter a decimal number");
const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount with up to 2 decimals");

export const settingsSchema = z
  .object({
    merchantMargin: ratio,
    platformMargin: ratio,
    // Both curves end at q; exponential decay (q^(w/L)) needs 0 < q < 1.
    floor: ratio.refine(
      (v) => RATIO.test(v) && new D(v).gt(0) && new D(v).lt(1),
      "Must be above 0 and below 1",
    ),
    midpointRatio: ratio,
    baseSteepness: ratio,
    refLife: z.coerce.number().int().min(1).max(3650),
    minLifespanDays: z.coerce.number().int().min(1).max(3650),
    maxLifespanDays: z.coerce.number().int().min(1).max(3650),
    // Zod runs this even when the format check failed, so re-check before parsing.
    maxDiscount: ratio.refine((v) => RATIO.test(v) && new D(v).lt(1), "Must be below 1"),
    releaseLeadDays: z.coerce.number().int().min(0).max(90),
    releaseDiscountStep: ratio,
    capitalRate: ratio,
    holdCost: money,
    offerResponseHours: z.coerce.number().int().min(1).max(720),
    earlyReturnNoticeDays: z.coerce.number().int().min(0).max(90),
    maxPairsPerBundle: z.coerce.number().int().min(1).max(10),
    disputeWindowDays: z.coerce.number().int().min(0).max(30),
    freeReturnHours: z.coerce.number().int().min(0).max(168),
    catchUpEnabled: z.boolean(),
    chargePastLife: z.boolean(),
  })
  .refine((s) => s.minLifespanDays <= s.maxLifespanDays, {
    message: "Must be at least the minimum lifespan",
    path: ["maxLifespanDays"],
  });

export type SettingsInput = z.infer<typeof settingsSchema>;

/** Settings are append-only: each change is a new row, so past rentals keep their history. */
export async function updateSettings(input: SettingsInput, adminId: string) {
  return db.pricingSettings.create({
    data: { ...input, createdById: adminId },
  });
}
