import { D } from "@/lib/decimal";
import { getCurrentUser } from "@/server/auth/session";
import { LIFESPAN_MAX_DAYS, LIFESPAN_MIN_DAYS } from "@/server/catalogue";
import { curvePreview } from "@/server/catalogue/pricing";
import { getActiveSettings, toPricingSettings } from "@/server/settings";

/** Live curve preview for the add-shoe form: GET ?value=6000&lifespan=365 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "MERCHANT" && user.role !== "ADMIN")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const value = params.get("value") ?? "";
  const lifespan = params.get("lifespan") ?? "";
  if (!/^\d+(\.\d{1,2})?$/.test(value) || new D(value).lte(0)) {
    return Response.json({ error: "Enter a value" }, { status: 400 });
  }
  const days = Number(lifespan);
  if (!Number.isInteger(days) || days < LIFESPAN_MIN_DAYS || days > LIFESPAN_MAX_DAYS) {
    return Response.json(
      { error: `Lifespan must be ${LIFESPAN_MIN_DAYS}–${LIFESPAN_MAX_DAYS} wear-days` },
      { status: 400 },
    );
  }
  const settings = toPricingSettings(await getActiveSettings());
  return Response.json(curvePreview(value, days, settings));
}
