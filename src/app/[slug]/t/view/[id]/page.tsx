import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteAnalytics } from "@/components/site/analytics";
import { SiteFrame, TestimonialCard } from "@/components/site/public-site";
import { getPublicSite, getPublicWorkspace } from "@/lib/site/public-data";
import { reviewJsonLd, siteMetadata } from "@/lib/site/seo";
import { SiteUnavailable } from "../../../unavailable";

async function load(slug: string, id: string) {
  const workspace = await getPublicWorkspace(slug);
  if (!workspace) notFound();
  if (workspace.status !== "active") return null;
  const site = await getPublicSite(workspace);
  const testimonial = site?.testimonials.find((t) => t.id === id);
  if (!site || !testimonial) notFound();
  return { site, testimonial };
}

export async function generateMetadata({ params }: PageProps<"/[slug]/t/view/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const data = await load(slug, id);
  if (!data) return { title: "Temporarily unavailable", robots: { index: false } };
  const { site, testimonial: t } = data;
  const who = [t.name, t.role, t.company].filter(Boolean).join(", ");
  const quote = t.quote.length > 150 ? `${t.quote.slice(0, 147)}…` : t.quote;
  return siteMetadata(site, {
    path: `/${site.workspace.slug}/t/view/${t.id}`,
    title: t.headline ? `${t.headline} — ${site.brand.siteName}` : `${who || "Client"} on ${site.brand.siteName}`,
    description: `“${quote}”${who ? ` — ${who}` : ""}`,
    image: `/api/public/og/${site.workspace.slug}/t/${t.id}`,
  });
}

/** Single testimonial with its own Open Graph card, for LinkedIn and chat (brief §5.2). */
export default async function TestimonialPage({ params }: PageProps<"/[slug]/t/view/[id]">) {
  const { slug, id } = await params;
  const data = await load(slug, id);
  if (!data) return <SiteUnavailable />;
  const { site, testimonial } = data;
  const c = site.layout.content;
  const ctaHref = c.cta_url || site.profile.contactLinks[0] || "";

  return (
    <SiteFrame theme={site.theme} customCss>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: reviewJsonLd(site, [testimonial], `/${site.workspace.slug}/t/view/${testimonial.id}`) }}
      />
      <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-5 py-12">
        <p className="mb-4 text-[0.9em] text-[var(--site-muted)]">
          Testimonial for{" "}
          <a href={`/${site.workspace.slug}`} className="font-medium text-[var(--site-text)] hover:underline">
            {site.brand.siteName}
          </a>
        </p>
        <TestimonialCard t={testimonial} theme={site.theme} fields={site.layout.card.fields} size="large" />
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a href={`/${site.workspace.slug}`} className="text-[0.95em] font-medium text-[var(--site-primary)] hover:underline">
            See all testimonials →
          </a>
          {c.cta_label && ctaHref && (
            <a
              href={ctaHref}
              className="inline-flex h-11 items-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-6 font-semibold text-[var(--site-background)] hover:opacity-90"
            >
              {c.cta_label}
            </a>
          )}
        </div>
      </main>
      <SiteAnalytics seo={site.seo} />
    </SiteFrame>
  );
}
