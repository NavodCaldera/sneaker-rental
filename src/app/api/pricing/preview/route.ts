import { D } from "@/lib/decimal";
import { validateListing } from "@/lib/pricing";
import { getCurrentUser } from "@/server/auth/session";
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
  if (!/^\d+$/.test(lifespan)) {
    return Response.json({ error: "Lifespan must be whole wear-days" }, { status: 400 });
  }
  const settings = toPricingSettings(await getActiveSettings());
  try {
    validateListing(value, lifespan, settings);
  } catch (e) {
    if (e instanceof RangeError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
  return Response.json(curvePreview(value, lifespan, settings));
}
