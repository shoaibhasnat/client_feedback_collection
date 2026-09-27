import { isUuid, mediaNotFound, streamPublicFile } from "@/lib/site/media";

const KINDS = new Set(["owner_photo", "logo_light", "logo_dark", "favicon", "og_image"]);

// Branding assets of an active workspace. URLs carry a version, so they can be cached longer.
export async function GET(_req: Request, ctx: RouteContext<"/api/public/brand/[ws]/[v]/[kind]">) {
  const { ws, kind } = await ctx.params;
  if (!isUuid(ws) || !KINDS.has(kind)) return mediaNotFound();
  return streamPublicFile(async (anon) => {
    const { data } = await anon.rpc("public_brand_path", { p_workspace: ws, p_kind: kind });
    return typeof data === "string" ? data : null;
  }, 3600);
}
