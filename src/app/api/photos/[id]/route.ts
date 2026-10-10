import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { PUBLIC_PHOTO_KINDS, storage } from "@/server/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const photo = await db.photo.findUnique({ where: { id } });
  if (!photo) return new Response("Not found", { status: 404 });

  const isPublic = PUBLIC_PHOTO_KINDS.includes(photo.kind);
  if (!isPublic && !(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });

  const bytes = await storage().get(photo.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": isPublic ? "public, max-age=86400, immutable" : "private, max-age=3600",
      // Seed placeholders are SVG; never let an image run script.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
