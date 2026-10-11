import { D } from "@/lib/decimal";
import { validateListing } from "@/lib/pricing";
import { getCurrentUser } from "@/server/auth/session";
import { listingLimits, pricingMethodSchema } from "@/server/catalogue";
import { curvePreview } from "@/server/catalogue/pricing";
import { db } from "@/server/db";
import { getActiveSettings, toPricingSettings } from "@/server/settings";

/** Live curve preview for the add-shoe form: GET ?value=6000&lifespan=365&method=EXPONENTIAL */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "MERCHANT" && user.role !== "ADMIN")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const value = params.get("value") ?? "";
  const lifespan = params.get("lifespan") ?? "";
  const method = pricingMethodSchema.safeParse(params.get("method") ?? "LOGISTIC");
  if (!/^\d+(\.\d{1,2})?$/.test(value) || new D(value).lte(0)) {
    return Response.json({ error: "Enter a value" }, { status: 400 });
  }
  if (!/^\d+$/.test(lifespan)) {
    return Response.json({ error: "Lifespan must be whole days" }, { status: 400 });
  }
  if (!method.success) {
    return Response.json({ error: "Choose a pricing method" }, { status: 400 });
  }
  const row = await getActiveSettings();
  const settings = toPricingSettings(row);
  const merchant = await db.merchant.findUnique({ where: { userId: user.id } });
  const limits = listingLimits(row, merchant ?? { maxLifespanDays: null });
  try {
    validateListing(value, lifespan, {
      minLife: limits.minLifespanDays,
      maxLife: limits.maxLifespanDays,
    });
  } catch (e) {
    if (e instanceof RangeError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return Response.json(curvePreview(value, lifespan, settings, method.data));
}
