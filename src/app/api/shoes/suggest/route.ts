import { suggestShoes } from "@/server/catalogue";

/** Search-box suggestions for the home and Browse pages: GET ?q=nik. Public, like Browse. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > 60) return Response.json([]);
  return Response.json(await suggestShoes(q));
}
