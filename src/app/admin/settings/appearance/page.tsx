import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { parseLayout, parseSeo, parseTheme } from "@/lib/site/config";
import { getPublicSite } from "@/lib/site/public-data";
import type { PublicSite, PublicTestimonial } from "@/lib/site/types";
import { signPaths } from "@/lib/uploads";
import { AppearanceEditor } from "./appearance-editor";

export const metadata: Metadata = { title: "Appearance" };

const SAMPLES: PublicTestimonial[] = [
  {
    id: "sample-1",
    quote: "Our store went from sluggish to lightning fast. Conversions are up 18% and launch was two weeks early.",
    headline: "Launched two weeks early",
    name: "Alex Morgan",
    role: "Founder",
    company: "Sample Store",
    rating: 5,
    date: "2026-08-01",
    platform: "upwork",
    photo: null,
    logo: null,
    featured: true,
    tagIds: [],
  },
  {
    id: "sample-2",
    quote: "Clear communication, sensible advice and a result that just works. I'd hire again without hesitation.",
    headline: null,
    name: "Jamie Lee",
    role: "Marketing lead",
    company: null,
    rating: 5,
    date: "2026-06-15",
    platform: "direct",
    photo: null,
    logo: null,
    featured: false,
    tagIds: [],
  },
  {
    id: "sample-3",
    quote: "Took a messy brief and turned it into something our customers love.",
    headline: null,
    name: null,
    role: "Founder, e-commerce brand",
    company: null,
    rating: 4,
    date: "2026-05-02",
    platform: null,
    photo: null,
    logo: null,
    featured: false,
    tagIds: [],
  },
];

export default async function AppearancePage() {
  const { supabase, workspace, readOnly } = await requireOwner();
  const [{ data: settings }, { data: versions }] = await Promise.all([
    supabase.from("site_settings").select("theme, layout, seo, profile").eq("workspace_id", workspace.id).single(),
    supabase.from("theme_versions").select("id, saved_at, theme").order("saved_at", { ascending: false }).limit(10),
  ]);
  const theme = parseTheme(settings?.theme);
  const layout = parseLayout(settings?.layout);
  const seo = parseSeo(settings?.seo);
  const profile = (settings?.profile ?? {}) as Record<string, unknown>;

  const sign = await signPaths(supabase, [
    theme.branding.logo_light,
    theme.branding.logo_dark,
    theme.branding.favicon,
    seo.og_image,
    theme.form.background_image,
    profile.photo_url as string | null,
  ]);
  const assets = {
    logo_light: sign(theme.branding.logo_light),
    logo_dark: sign(theme.branding.logo_dark),
    favicon: sign(theme.branding.favicon),
    og_image: sign(seo.og_image),
    form_background: sign(theme.form.background_image),
  };

  // Preview content: the real published testimonials, or samples until there are some.
  const live = workspace.status === "active" ? await getPublicSite({ ...workspace, status: "active" }) : null;
  const testimonials = live?.testimonials.length ? live.testimonials : SAMPLES;
  const ratings = testimonials.map((t) => t.rating).filter((r): r is number => !!r);
  const preview: PublicSite = {
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    profile: {
      name: String(profile.name ?? ""),
      tagline: String(profile.tagline ?? ""),
      bio: String(profile.bio ?? ""),
      services: Array.isArray(profile.services) ? profile.services.map(String) : [],
      contactLinks: Array.isArray(profile.contact_links) ? profile.contact_links.map(String) : [],
      photo: sign(profile.photo_url as string | null),
    },
    theme,
    layout,
    seo,
    brand: { siteName: "", logoLight: assets.logo_light, logoDark: assets.logo_dark, favicon: assets.favicon, ogImage: assets.og_image },
    testimonials,
    tags: live?.tags ?? [],
    stats: { count: testimonials.length, average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null },
  };

  return (
    <AppearanceEditor
      initial={{ theme, layout, seo }}
      assets={assets}
      preview={preview}
      usingSamples={!live?.testimonials.length}
      versions={(versions ?? []).map((v) => ({ id: v.id, saved_at: v.saved_at, preset: String((v.theme as { theme?: { preset?: string } })?.theme?.preset ?? "custom") }))}
      publicUrl={`${env.appUrl}/${workspace.slug}`}
      readOnly={readOnly}
    />
  );
}
