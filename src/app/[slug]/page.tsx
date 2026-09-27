import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteAnalytics } from "@/components/site/analytics";
import { PublicWall, SiteFrame } from "@/components/site/public-site";
import { filterTestimonials, getPublicSite, getPublicWorkspace, resolveTag } from "@/lib/site/public-data";
import { reviewJsonLd, siteMetadata } from "@/lib/site/seo";
import { SiteUnavailable } from "./unavailable";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function load(slug: string) {
  const workspace = await getPublicWorkspace(slug);
  if (!workspace) notFound();
  if (workspace.status !== "active") return { workspace, site: null };
  const site = await getPublicSite(workspace);
  if (!site) notFound();
  return { workspace, site };
}

export async function generateMetadata({ params, searchParams }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { site } = await load(slug);
  if (!site) return { title: "Temporarily unavailable", robots: { index: false } };
  const tag = resolveTag(site.tags, str((await searchParams).tag));
  return siteMetadata(site, {
    path: `/${site.workspace.slug}`,
    title: tag ? `${tag.name} testimonials — ${site.brand.siteName}` : undefined,
  });
}

/** Public testimonial wall (brief §5.1, §10.6: app.com/{slug}). */
export default async function WallPage({ params, searchParams }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { site } = await load(slug);
  if (!site) return <SiteUnavailable />;

  const tagParam = str(sp.tag);
  const activeTag = resolveTag(site.tags, tagParam);
  const q = str(sp.q).slice(0, 100);
  // An unknown tag shows no results rather than silently showing everything.
  const list = filterTestimonials(site.testimonials, { tag: activeTag?.id ?? (tagParam ? "__none__" : null), q });

  return (
    <SiteFrame theme={site.theme}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: reviewJsonLd(site, site.testimonials, `/${site.workspace.slug}`) }} />
      <PublicWall site={site} list={list} activeTag={activeTag} q={q} basePath={`/${site.workspace.slug}`} />
      <SiteAnalytics seo={site.seo} />
    </SiteFrame>
  );
}
