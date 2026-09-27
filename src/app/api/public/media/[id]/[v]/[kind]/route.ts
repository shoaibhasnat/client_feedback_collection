import { isUuid, mediaNotFound, redirectToPublicFile, streamPublicFile } from "@/lib/site/media";

const KINDS = new Set(["photo", "logo", "video", "video_thumb"]);

// Media of a PUBLISHED testimonial. Consent is enforced when the testimonial is published,
// and re-checked here on every uncached request (unpublishing takes effect within the cache window).
export async function GET(_req: Request, ctx: RouteContext<"/api/public/media/[id]/[v]/[kind]">) {
  const { id, kind } = await ctx.params;
  if (!isUuid(id) || !KINDS.has(kind)) return mediaNotFound();
  const resolve = async (anon: Parameters<Parameters<typeof streamPublicFile>[0]>[0]) => {
    const { data } = await anon.rpc("public_media_path", { p_testimonial: id, p_kind: kind });
    return typeof data === "string" ? data : null;
  };
  // Videos are large and need range requests for seeking, so the browser is sent to a
  // short-lived signed storage URL instead of streaming through this server.
  if (kind === "video") return redirectToPublicFile(resolve);
  return streamPublicFile(resolve, 300);
}
