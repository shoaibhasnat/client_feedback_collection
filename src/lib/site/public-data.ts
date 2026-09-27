import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { realtimeOptions } from "@/lib/supabase/transport";
import { parseLayout, parseSeo, parseTheme } from "@/lib/site/config";
import { PUBLIC_WORKSPACES_TAG, siteTag } from "@/lib/site/cache";
import type { PublicSite, PublicTag, PublicTestimonial } from "@/lib/site/types";

// Public data is read with the ANON key through SECURITY DEFINER functions that return public
// columns only (migration 20260929000001). The anon role has no table access, so page code
// cannot accidentally select private data even if it tried.

function anon() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...realtimeOptions,
  });
}

const RESERVED = new Set(["admin", "superadmin", "login", "invite", "t", "a", "api", "auth", "forgot-password", "reset-password", "_next"]);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export type PublicWorkspace = { id: string; name: string; slug: string; status: "active" | "suspended" };

export async function getPublicWorkspace(slug: string): Promise<PublicWorkspace | null> {
  const s = slug.toLowerCase();
  if (!SLUG_RE.test(s) || RESERVED.has(s)) return null;
  return unstable_cache(
    async () => {
      const { data } = await anon().rpc("public_workspace", { p_slug: s });
      const row = (data as PublicWorkspace[] | null)?.[0];
      return row ?? null;
    },
    ["public-workspace", s],
    { tags: [PUBLIC_WORKSPACES_TAG], revalidate: 300 },
  )();
}

const mediaUrl = (id: string, version: number, kind: "photo" | "logo" | "video" | "video_thumb") => `/api/public/media/${id}/${version}/${kind}`;
const brandUrl = (workspaceId: string, version: number, kind: string) => `/api/public/brand/${workspaceId}/${version}/${kind}`;

type RawTestimonial = {
  id: string;
  quote: string;
  headline: string | null;
  name: string | null;
  role: string | null;
  company: string | null;
  rating: number | null;
  date: string | null;
  platform: string | null;
  has_photo: boolean;
  has_logo: boolean;
  has_video: boolean;
  has_video_thumb: boolean;
  featured: boolean;
  sort_order: number;
  tag_ids: string[];
  version: number;
};

/** Everything the public site needs for one active workspace (cached; invalidated on owner changes). */
export async function getPublicSite(workspace: PublicWorkspace): Promise<PublicSite | null> {
  if (workspace.status !== "active") return null;
  return unstable_cache(
    async (): Promise<PublicSite | null> => {
      const db = anon();
      const [siteRes, testimonialsRes, tagsRes] = await Promise.all([
        db.rpc("public_site", { p_workspace: workspace.id }),
        db.rpc("public_testimonials", { p_workspace: workspace.id }),
        db.rpc("public_tags", { p_workspace: workspace.id }),
      ]);
      const site = siteRes.data as Record<string, unknown> | null;
      if (!site) return null;

      const profile = (site.profile ?? {}) as Record<string, unknown>;
      const rawTheme = (site.theme ?? {}) as Record<string, unknown>;
      const branding = (rawTheme.branding ?? {}) as Record<string, unknown>;
      const seoRaw = (site.seo ?? {}) as Record<string, unknown>;
      const version = Math.floor(new Date(String(site.updated_at ?? 0)).getTime() / 1000) || 0;

      const theme = parseTheme({ ...rawTheme, branding: { site_name: branding.site_name ?? "" } });
      const testimonials: PublicTestimonial[] = ((testimonialsRes.data ?? []) as RawTestimonial[]).map((t) => ({
        id: t.id,
        quote: t.quote,
        headline: t.headline,
        name: t.name,
        role: t.role,
        company: t.company,
        rating: t.rating,
        date: t.date,
        platform: t.platform,
        photo: t.has_photo ? mediaUrl(t.id, t.version, "photo") : null,
        logo: t.has_logo ? mediaUrl(t.id, t.version, "logo") : null,
        video: t.has_video ? mediaUrl(t.id, t.version, "video") : null,
        videoThumb: t.has_video && t.has_video_thumb ? mediaUrl(t.id, t.version, "video_thumb") : null,
        featured: t.featured,
        tagIds: t.tag_ids ?? [],
      }));
      const ratings = testimonials.map((t) => t.rating).filter((r): r is number => typeof r === "number");

      return {
        workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
        profile: {
          name: String(profile.name ?? ""),
          tagline: String(profile.tagline ?? ""),
          bio: String(profile.bio ?? ""),
          services: Array.isArray(profile.services) ? profile.services.map(String).slice(0, 30) : [],
          contactLinks: Array.isArray(profile.contact_links)
            ? profile.contact_links.map(String).filter((l) => /^https?:\/\//.test(l)).slice(0, 20)
            : [],
          photo: profile.has_photo ? brandUrl(workspace.id, version, "owner_photo") : null,
        },
        theme,
        layout: parseLayout(site.layout),
        seo: parseSeo({ ...seoRaw, og_image: null }),
        brand: {
          siteName: String(branding.site_name || profile.name || workspace.name),
          logoLight: branding.has_logo_light ? brandUrl(workspace.id, version, "logo_light") : null,
          logoDark: branding.has_logo_dark ? brandUrl(workspace.id, version, "logo_dark") : null,
          favicon: branding.has_favicon ? brandUrl(workspace.id, version, "favicon") : null,
          ogImage: seoRaw.has_og_image ? brandUrl(workspace.id, version, "og_image") : null,
        },
        testimonials,
        tags: (tagsRes.data ?? []) as PublicTag[],
        stats: {
          count: testimonials.length,
          average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        },
      };
    },
    ["public-site", workspace.id],
    { tags: [siteTag(workspace.id)], revalidate: 300 },
  )();
}

export type PublicCollection = { id: string; name: string; slug: string; intro_text: string | null; testimonial_ids: string[] };

export async function getPublicCollection(workspaceId: string, slug: string): Promise<PublicCollection | null> {
  if (!SLUG_RE.test(slug)) return null;
  return unstable_cache(
    async () => {
      const { data } = await anon().rpc("public_collection", { p_workspace: workspaceId, p_slug: slug });
      return (data as PublicCollection | null) ?? null;
    },
    ["public-collection", workspaceId, slug],
    { tags: [siteTag(workspaceId)], revalidate: 300 },
  )();
}

/** Filter by tag id and free-text search; used by the wall and mirrored in the URL. */
export function filterTestimonials(list: PublicTestimonial[], opts: { tag?: string | null; q?: string | null }) {
  const q = (opts.q ?? "").trim().toLowerCase().slice(0, 100);
  return list.filter((t) => {
    if (opts.tag && !t.tagIds.includes(opts.tag)) return false;
    if (!q) return true;
    return [t.quote, t.headline, t.name, t.role, t.company].some((v) => v?.toLowerCase().includes(q));
  });
}

/** Resolve a `?tag=` value given either a tag id or a tag name/slug (e.g. `?tag=shopify`). */
export function resolveTag(tags: PublicTag[], value: string | null | undefined): PublicTag | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return tags.find((t) => t.id === v || t.name.toLowerCase() === v || slug(t.name) === slug(v)) ?? null;
}

export type PublicWidget = {
  workspace: PublicWorkspace;
  config: unknown;
  collection_ids: string[] | null;
};

export const widgetTag = (widgetId: string) => `widget:${widgetId}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_RE = /^[0-9a-f]{32}$/;

/** A widget by its workspace public key + widget id (brief §10.6), or null. */
export async function getPublicWidget(publicKey: string, widgetId: string): Promise<PublicWidget | null> {
  if (!KEY_RE.test(publicKey) || !UUID_RE.test(widgetId)) return null;
  return unstable_cache(
    async () => {
      const { data } = await anon().rpc("public_widget", { p_key: publicKey, p_widget: widgetId });
      return (data as PublicWidget | null) ?? null;
    },
    ["public-widget", publicKey, widgetId],
    { tags: [widgetTag(widgetId)], revalidate: 300 },
  )();
}
