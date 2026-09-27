import type { Metadata } from "next";
import { env } from "@/lib/env";
import type { PublicSite, PublicTestimonial } from "@/lib/site/types";

/** JSON-LD for Review / AggregateRating (brief §5.1). Escaped so it can't close the <script> tag. */
export function reviewJsonLd(site: PublicSite, list: PublicTestimonial[], url: string): string {
  const rated = list.filter((t) => t.rating);
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.brand.siteName,
    url,
    ...(site.profile.tagline ? { description: site.profile.tagline } : {}),
    ...(rated.length
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: (rated.reduce((a, t) => a + (t.rating ?? 0), 0) / rated.length).toFixed(1),
            reviewCount: rated.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    review: list.slice(0, 50).map((t) => ({
      "@type": "Review",
      reviewBody: t.quote,
      ...(t.headline ? { name: t.headline } : {}),
      ...(t.date ? { datePublished: t.date } : {}),
      author: { "@type": "Person", name: t.name || t.role || "Verified client" },
      ...(t.rating ? { reviewRating: { "@type": "Rating", ratingValue: t.rating, bestRating: 5, worstRating: 1 } } : {}),
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function siteMetadata(site: PublicSite, opts: { path: string; title?: string; description?: string; image?: string }): Metadata {
  const title = opts.title || site.seo.title || `${site.brand.siteName} — Testimonials`;
  const description =
    opts.description || site.seo.description || site.profile.tagline || `What clients say about working with ${site.brand.siteName}.`;
  const image = opts.image || site.brand.ogImage || `/api/public/og/${site.workspace.slug}`;
  return {
    metadataBase: new URL(env.appUrl),
    title: { absolute: title },
    description,
    alternates: { canonical: opts.path },
    robots: site.seo.noindex ? { index: false, follow: false } : { index: true, follow: true },
    icons: site.brand.favicon ? { icon: site.brand.favicon } : undefined,
    openGraph: { type: "website", title, description, url: opts.path, siteName: site.brand.siteName, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
