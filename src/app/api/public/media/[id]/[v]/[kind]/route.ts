import { isUuid, mediaNotFound, streamPublicFile } from "@/lib/site/media";

// Photo / logo of a PUBLISHED testimonial. Consent is enforced when the testimonial is published,
// and re-checked here on every uncached request (unpublishing takes effect within the cache window).
export async function GET(_req: Request, ctx: RouteContext<"/api/public/media/[id]/[v]/[kind]">) {
  const { id, kind } = await ctx.params;
  if (!isUuid(id) || (kind !== "photo" && kind !== "logo")) return mediaNotFound();
  return streamPublicFile(async (anon) => {
    const { data } = await anon.rpc("public_media_path", { p_testimonial: id, p_kind: kind });
    return typeof data === "string" ? data : null;
  }, 300);
}
