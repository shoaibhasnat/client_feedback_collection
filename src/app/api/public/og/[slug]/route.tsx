import { getPublicSite, getPublicWorkspace } from "@/lib/site/public-data";
import { siteOgImage } from "@/lib/site/og";

export async function GET(_req: Request, ctx: RouteContext<"/api/public/og/[slug]">) {
  const { slug } = await ctx.params;
  const workspace = await getPublicWorkspace(slug);
  const site = workspace ? await getPublicSite(workspace) : null;
  if (!site) return new Response("Not found", { status: 404 });
  return siteOgImage(site);
}
