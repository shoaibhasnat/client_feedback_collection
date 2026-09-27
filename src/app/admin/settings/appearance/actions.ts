"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { revalidateSite } from "@/lib/site/cache";
import { customCssProblem, parseLayout, parseSeo, parseTheme, type LayoutConfig, type SeoConfig, type ThemeConfig } from "@/lib/site/config";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/uploads";

export type AppearanceResult = { ok: boolean; error?: string; url?: string | null };

type Ctx = Awaited<ReturnType<typeof assertWritable>>;

async function current(ctx: Ctx) {
  const { data } = await ctx.supabase.from("site_settings").select("theme, layout, seo").eq("workspace_id", ctx.workspace.id).single();
  return { theme: parseTheme(data?.theme), layout: parseLayout(data?.layout), seo: parseSeo(data?.seo), raw: data };
}

function refresh(workspaceId: string) {
  revalidatePath("/admin/settings/appearance");
  revalidateSite(workspaceId);
}

/** Keep the last 10 saved versions (brief §6 "undo safety"). */
async function pushVersion(ctx: Ctx, snapshot: { theme: unknown; layout: unknown }) {
  await ctx.supabase.from("theme_versions").insert({ workspace_id: ctx.workspace.id, theme: snapshot });
  const { data } = await ctx.supabase.from("theme_versions").select("id").order("saved_at", { ascending: false });
  const stale = (data ?? []).slice(10).map((v) => v.id);
  if (stale.length) await ctx.supabase.from("theme_versions").delete().in("id", stale);
}

/**
 * Save theme, layout and SEO. Asset paths (logos, favicon, OG image, form background) are never taken
 * from the browser: they are kept from the stored settings and only change through the upload actions.
 */
export async function saveAppearanceAction(input: { theme: ThemeConfig; layout: LayoutConfig; seo: SeoConfig }): Promise<AppearanceResult> {
  const ctx = await assertWritable();
  const cur = await current(ctx);

  const cta = input.layout?.content?.cta_url ?? "";
  if (cta && !/^(https?:\/\/|mailto:)\S+$/.test(cta)) return { ok: false, error: "The call-to-action link must start with https:// or mailto:" };
  const analytics = input.seo?.analytics;
  if (analytics?.provider === "plausible" && !/^[a-z0-9.-]{3,100}$/i.test(analytics.id)) return { ok: false, error: "Enter your Plausible site domain, e.g. example.com" };
  if (analytics?.provider === "google" && !/^G-[A-Z0-9]{4,20}$/.test(analytics.id)) return { ok: false, error: "Enter a Google Analytics measurement ID like G-ABC123XYZ." };

  const cssProblem = customCssProblem(String(input.theme?.custom_css ?? ""));
  if (cssProblem) return { ok: false, error: cssProblem };

  const theme = parseTheme({
    ...input.theme,
    branding: { ...cur.theme.branding, site_name: String(input.theme?.branding?.site_name ?? "").slice(0, 80) },
    form: cur.theme.form,
  });
  const layout = parseLayout(input.layout);
  const seo = parseSeo({ ...input.seo, og_image: cur.seo.og_image });

  if (JSON.stringify(cur.raw?.theme) !== JSON.stringify(theme) || JSON.stringify(cur.raw?.layout) !== JSON.stringify(layout)) {
    await pushVersion(ctx, { theme: cur.theme, layout: cur.layout });
  }
  const { error } = await ctx.supabase.from("site_settings").update({ theme, layout, seo }).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: error.message };
  refresh(ctx.workspace.id);
  return { ok: true };
}

export async function restoreVersionAction(versionId: string): Promise<AppearanceResult> {
  const ctx = await assertWritable();
  if (!z.uuid().safeParse(versionId).success) return { ok: false, error: "Version not found." };
  const { data: v } = await ctx.supabase.from("theme_versions").select("theme").eq("id", versionId).maybeSingle();
  if (!v) return { ok: false, error: "Version not found." };
  const cur = await current(ctx);
  const saved = (v.theme ?? {}) as { theme?: unknown; layout?: unknown };
  // Restoring brings back the look; current branding assets stay (they may have been deleted since).
  const theme = parseTheme({ ...(saved.theme as object), branding: cur.theme.branding, form: cur.theme.form });
  const layout = parseLayout(saved.layout ?? cur.layout);
  await pushVersion(ctx, { theme: cur.theme, layout: cur.layout });
  const { error } = await ctx.supabase.from("site_settings").update({ theme, layout }).eq("workspace_id", ctx.workspace.id);
  if (error) return { ok: false, error: error.message };
  refresh(ctx.workspace.id);
  return { ok: true };
}

// ---------- Branding assets ----------------------------------------------

const ASSETS = {
  logo_light: { where: "theme", key: "logo_light", fit: { width: 600, height: 200, fit: "inside" }, format: "webp" },
  logo_dark: { where: "theme", key: "logo_dark", fit: { width: 600, height: 200, fit: "inside" }, format: "webp" },
  favicon: { where: "theme", key: "favicon", fit: { width: 64, height: 64, fit: "cover" }, format: "png" },
  og_image: { where: "seo", key: "og_image", fit: { width: 1200, height: 630, fit: "cover" }, format: "jpeg" },
  form_background: { where: "form", key: "background_image", fit: { width: 1920, height: 1920, fit: "inside" }, format: "webp" },
} as const;
export type AssetKind = keyof typeof ASSETS;

function readPath(cur: Awaited<ReturnType<typeof current>>, kind: AssetKind): string | null {
  const a = ASSETS[kind];
  if (a.where === "seo") return cur.seo.og_image;
  if (a.where === "form") return cur.theme.form.background_image;
  return cur.theme.branding[a.key];
}

async function writePath(ctx: Ctx, cur: Awaited<ReturnType<typeof current>>, kind: AssetKind, path: string | null) {
  const a = ASSETS[kind];
  const patch =
    a.where === "seo"
      ? { seo: { ...cur.seo, og_image: path } }
      : a.where === "form"
        ? { theme: { ...cur.theme, form: { ...cur.theme.form, background_image: path } } }
        : { theme: { ...cur.theme, branding: { ...cur.theme.branding, [a.key]: path } } };
  return ctx.supabase.from("site_settings").update(patch).eq("workspace_id", ctx.workspace.id);
}

/** Upload a logo / favicon / OG image / form background. Re-encoded server-side (strips EXIF). */
export async function uploadAssetAction(kind: AssetKind, formData: FormData): Promise<AppearanceResult> {
  const ctx = await assertWritable();
  if (!(kind in ASSETS)) return { ok: false, error: "Unknown asset." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };
  if (!IMAGE_TYPES.includes(file.type)) return { ok: false, error: "Upload a JPG, PNG, WebP or GIF image." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be 8 MB or smaller." };

  const a = ASSETS[kind];
  let body: Buffer;
  try {
    const img = sharp(Buffer.from(await file.arrayBuffer()), { animated: false, limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ ...a.fit, withoutEnlargement: a.fit.fit === "inside" });
    body = await (a.format === "png" ? img.png() : a.format === "jpeg" ? img.jpeg({ quality: 85 }) : img.webp({ quality: 85 })).toBuffer();
  } catch {
    return { ok: false, error: "That file isn't a valid image." };
  }

  const cur = await current(ctx);
  const previous = readPath(cur, kind);
  const path = `${ctx.workspace.id}/branding/${kind}-${randomToken(6)}.${a.format === "jpeg" ? "jpg" : a.format}`;
  const { error: upErr } = await ctx.supabase.storage.from("uploads").upload(path, body, { contentType: `image/${a.format}` });
  if (upErr) return { ok: false, error: upErr.message };
  const { error } = await writePath(ctx, cur, kind, path);
  if (error) return { ok: false, error: error.message };
  if (previous?.startsWith(`${ctx.workspace.id}/`)) await ctx.supabase.storage.from("uploads").remove([previous]);

  const { data: signed } = await ctx.supabase.storage.from("uploads").createSignedUrl(path, 3600);
  refresh(ctx.workspace.id);
  return { ok: true, url: signed?.signedUrl ?? null };
}

export async function removeAssetAction(kind: AssetKind): Promise<AppearanceResult> {
  const ctx = await assertWritable();
  if (!(kind in ASSETS)) return { ok: false, error: "Unknown asset." };
  const cur = await current(ctx);
  const previous = readPath(cur, kind);
  const { error } = await writePath(ctx, cur, kind, null);
  if (error) return { ok: false, error: error.message };
  if (previous?.startsWith(`${ctx.workspace.id}/`)) await ctx.supabase.storage.from("uploads").remove([previous]);
  refresh(ctx.workspace.id);
  return { ok: true, url: null };
}
