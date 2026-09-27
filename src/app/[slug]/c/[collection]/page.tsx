import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteAnalytics } from "@/components/site/analytics";
import { CardList, SiteFrame } from "@/components/site/public-site";
import { getPublicCollection, getPublicSite, getPublicWorkspace } from "@/lib/site/public-data";
import { reviewJsonLd, siteMetadata } from "@/lib/site/seo";
import { SiteUnavailable } from "../../unavailable";
import { Credits } from "@/components/credits";

async function load(slug: string, collectionSlug: string) {
  const workspace = await getPublicWorkspace(slug);
  if (!workspace) notFound();
  if (workspace.status !== "active") return null;
  const [site, collection] = await Promise.all([getPublicSite(workspace), getPublicCollection(workspace.id, collectionSlug.toLowerCase())]);
  if (!site || !collection) notFound();
  const byId = new Map(site.testimonials.map((t) => [t.id, t]));
  const list = collection.testimonial_ids.map((id) => byId.get(id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  return { site, collection, list };
}

export async function generateMetadata({ params }: PageProps<"/[slug]/c/[collection]">): Promise<Metadata> {
  const { slug, collection } = await params;
  const data = await load(slug, collection);
  if (!data) return { title: "Temporarily unavailable", robots: { index: false } };
  return siteMetadata(data.site, {
    path: `/${data.site.workspace.slug}/c/${data.collection.slug}`,
    title: `${data.collection.name} — ${data.site.brand.siteName}`,
    description: data.collection.intro_text || undefined,
  });
}

/** Hand-picked collection (brief §5.2: app.com/{slug}/c/{collection}). */
export default async function CollectionPage({ params }: PageProps<"/[slug]/c/[collection]">) {
  const { slug, collection } = await params;
  const data = await load(slug, collection);
  if (!data) return <SiteUnavailable />;
  const { site, list } = data;
  const c = site.layout.content;
  const ctaHref = c.cta_url || site.profile.contactLinks[0] || "";

  return (
    <SiteFrame theme={site.theme} customCss>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: reviewJsonLd(site, list, `/${site.workspace.slug}/c/${data.collection.slug}`) }}
      />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <p className="text-[0.9em] text-[var(--site-muted)]">
          <a href={`/${site.workspace.slug}`} className="hover:underline">
            {site.brand.siteName}
          </a>
        </p>
        <h1 className="mt-2 text-[2em] font-bold tracking-tight" style={{ fontFamily: "var(--site-font-heading)" }}>
          {data.collection.name}
        </h1>
        {data.collection.intro_text && <p className="mt-3 max-w-2xl whitespace-pre-line text-[1.05em] text-[var(--site-muted)]">{data.collection.intro_text}</p>}
        <div className="mt-8">
          {list.length ? (
            <CardList list={list} theme={site.theme} layout={site.layout} linkFor={(t) => `/${site.workspace.slug}/t/view/${t.id}`} />
          ) : (
            <p className="py-10 text-center text-[var(--site-muted)]">{c.empty_text}</p>
          )}
        </div>
        {c.cta_label && ctaHref && (
          <p className="mt-10 text-center">
            <a
              href={ctaHref}
              className="inline-flex h-11 items-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-6 font-semibold text-[var(--site-background)] hover:opacity-90"
            >
              {c.cta_label}
            </a>
          </p>
        )}
      </main>
      <footer className="mx-auto max-w-6xl border-t border-[var(--site-border)] px-5 py-6 text-[0.85em] text-[var(--site-muted)]">
        <Credits />
      </footer>
      <SiteAnalytics seo={site.seo} />
    </SiteFrame>
  );
}
