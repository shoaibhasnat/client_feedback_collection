import { getPublicSite, getPublicWorkspace } from "@/lib/site/public-data";
import { testimonialOgImage } from "@/lib/site/og";

export async function GET(_req: Request, ctx: RouteContext<"/api/public/og/[slug]/t/[id]">) {
  const { slug, id } = await ctx.params;
  const workspace = await getPublicWorkspace(slug);
  const site = workspace ? await getPublicSite(workspace) : null;
  const testimonial = site?.testimonials.find((t) => t.id === id);
  if (!site || !testimonial) return new Response("Not found", { status: 404 });
  return testimonialOgImage(site, testimonial);
}
