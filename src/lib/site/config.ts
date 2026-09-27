import { z } from "zod";

// Public site appearance (brief §6). Stored as JSON in site_settings (theme / layout / seo) so it can be
// exported, versioned and restored. Every parser falls back to defaults field by field, so a bad or
// older stored value never breaks the public page.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const PALETTE_KEYS = ["primary", "accent", "background", "surface", "text", "muted", "border"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type Palette = Record<PaletteKey, string>;

/** Curated Google Fonts (brief §6). Names are passed to fonts.googleapis.com as-is. */
export const FONTS = [
  { name: "Inter", category: "sans-serif" },
  { name: "DM Sans", category: "sans-serif" },
  { name: "Manrope", category: "sans-serif" },
  { name: "Work Sans", category: "sans-serif" },
  { name: "Poppins", category: "sans-serif" },
  { name: "Montserrat", category: "sans-serif" },
  { name: "Nunito", category: "sans-serif" },
  { name: "Source Sans 3", category: "sans-serif" },
  { name: "Space Grotesk", category: "sans-serif" },
  { name: "Playfair Display", category: "serif" },
  { name: "Fraunces", category: "serif" },
  { name: "Lora", category: "serif" },
  { name: "Merriweather", category: "serif" },
  { name: "Libre Baskerville", category: "serif" },
] as const;
export type FontName = (typeof FONTS)[number]["name"];
const FONT_NAMES = FONTS.map((f) => f.name) as [FontName, ...FontName[]];

export const SECTION_IDS = ["hero", "featured", "grid", "about", "services", "logos", "cta"] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Hero",
  featured: "Featured testimonials",
  grid: "All testimonials",
  about: "About",
  services: "Services",
  logos: "Client logos",
  cta: "Call-to-action footer",
};

export const CARD_FIELDS = ["headline", "rating", "name", "role", "company", "photo", "logo", "platform", "date"] as const;
export type CardField = (typeof CARD_FIELDS)[number];

// ---------- Defaults -------------------------------------------------------

const LIGHT: Palette = {
  primary: "#1f4fd8",
  accent: "#0f9d7a",
  background: "#ffffff",
  surface: "#f6f7f9",
  text: "#14171f",
  muted: "#5b6272",
  border: "#e3e6eb",
};
const DARK: Palette = {
  primary: "#7da2ff",
  accent: "#3dd6a8",
  background: "#0f1115",
  surface: "#181b21",
  text: "#eef0f4",
  muted: "#a1a8b6",
  border: "#2a2f38",
};

const paletteSchema = (fallback: Palette) =>
  z
    .object(Object.fromEntries(PALETTE_KEYS.map((k) => [k, hex.catch(fallback[k])])) as Record<PaletteKey, z.ZodCatch<z.ZodString>>)
    .catch(fallback);

export const themeSchema = z.object({
  preset: z.string().max(40).catch("minimal"),
  mode: z.enum(["light", "dark", "system"]).catch("light"),
  light: paletteSchema(LIGHT),
  dark: paletteSchema(DARK),
  fonts: z
    .object({
      heading: z.enum(FONT_NAMES).catch("Inter"),
      body: z.enum(FONT_NAMES).catch("Inter"),
      base_size: z.number().int().min(14).max(20).catch(16),
    })
    .catch({ heading: "Inter", body: "Inter", base_size: 16 }),
  radius: z.enum(["none", "small", "medium", "large"]).catch("medium"),
  card_style: z.enum(["flat", "bordered", "shadow"]).catch("bordered"),
  density: z.enum(["compact", "comfortable"]).catch("comfortable"),
  branding: z
    .object({
      site_name: z.string().max(80).catch(""),
      // Storage paths (owner side) — the public API exposes only has_* flags.
      logo_light: z.string().max(500).nullable().catch(null),
      logo_dark: z.string().max(500).nullable().catch(null),
      favicon: z.string().max(500).nullable().catch(null),
    })
    .catch({ site_name: "", logo_light: null, logo_dark: null, favicon: null }),
  form: z
    .object({
      background_image: z.string().max(500).nullable().catch(null),
    })
    .catch({ background_image: null }),
});
export type ThemeConfig = z.infer<typeof themeSchema>;

const contentSchema = z.object({
  hero_title: z.string().max(160).catch(""),
  hero_subtitle: z.string().max(400).catch(""),
  show_stats: z.boolean().catch(true),
  cta_label: z.string().max(60).catch(""),
  cta_url: z.union([z.literal(""), z.string().max(2000).regex(/^(https?:\/\/|mailto:)\S+$/)]).catch(""),
  featured_title: z.string().max(120).catch("Featured"),
  grid_title: z.string().max(120).catch("What clients say"),
  about_title: z.string().max(120).catch("About"),
  about_text: z.string().max(3000).catch(""),
  services_title: z.string().max(120).catch("Services"),
  logos_title: z.string().max(120).catch("Trusted by"),
  cta_title: z.string().max(160).catch(""),
  cta_text: z.string().max(600).catch(""),
  search_placeholder: z.string().max(80).catch("Search testimonials"),
  empty_text: z.string().max(300).catch("No testimonials to show yet."),
  footer_text: z.string().max(300).catch(""),
});

export const layoutSchema = z.object({
  sections: z
    .array(z.object({ id: z.enum(SECTION_IDS), visible: z.boolean() }))
    .catch([])
    .transform((list) => {
      // Keep the owner's order, drop duplicates, append any missing sections (hidden for optional ones).
      const seen = new Set<SectionId>();
      const out = list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
      for (const id of SECTION_IDS) if (!seen.has(id)) out.push({ id, visible: ["hero", "featured", "grid", "cta"].includes(id) });
      return out;
    }),
  card: z
    .object({
      layout: z.enum(["grid", "masonry"]).catch("masonry"),
      columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).catch(3),
      fields: z
        .object(Object.fromEntries(CARD_FIELDS.map((f) => [f, z.boolean().catch(true)])) as Record<CardField, z.ZodCatch<z.ZodBoolean>>)
        .catch(Object.fromEntries(CARD_FIELDS.map((f) => [f, true])) as Record<CardField, boolean>),
    })
    .catch({ layout: "masonry", columns: 3, fields: Object.fromEntries(CARD_FIELDS.map((f) => [f, true])) as Record<CardField, boolean> }),
  content: contentSchema.catch(contentSchema.parse({})),
});
export type LayoutConfig = z.infer<typeof layoutSchema>;

export const seoSchema = z.object({
  title: z.string().max(70).catch(""),
  description: z.string().max(200).catch(""),
  og_image: z.string().max(500).nullable().catch(null),
  noindex: z.boolean().catch(false),
  analytics: z
    .object({
      provider: z.enum(["none", "plausible", "google"]).catch("none"),
      // Validated identifiers only — never raw script (all workspaces share one origin).
      id: z.string().max(100).catch(""),
    })
    .catch({ provider: "none", id: "" }),
});
export type SeoConfig = z.infer<typeof seoSchema>;

export const parseTheme = (raw: unknown): ThemeConfig => themeSchema.parse(raw ?? {});
export const parseLayout = (raw: unknown): LayoutConfig => layoutSchema.parse(raw ?? {});
export const parseSeo = (raw: unknown): SeoConfig => seoSchema.parse(raw ?? {});

/** Analytics ids are the only analytics input; they must match the provider's format exactly. */
export function validAnalytics(a: SeoConfig["analytics"]): SeoConfig["analytics"] | null {
  if (a.provider === "plausible" && /^[a-z0-9.-]{3,100}$/i.test(a.id)) return a;
  if (a.provider === "google" && /^G-[A-Z0-9]{4,20}$/.test(a.id)) return a;
  return null;
}

// ---------- Presets ---------------------------------------------------------

export const THEME_PRESETS: { id: string; name: string; theme: Partial<ThemeConfig> }[] = [
  { id: "minimal", name: "Minimal", theme: { light: LIGHT, dark: DARK, fonts: { heading: "Inter", body: "Inter", base_size: 16 }, radius: "medium", card_style: "bordered", density: "comfortable", mode: "light" } },
  {
    id: "bold",
    name: "Bold",
    theme: {
      light: { primary: "#e11d48", accent: "#f59e0b", background: "#ffffff", surface: "#fff1f2", text: "#0f0f10", muted: "#52525b", border: "#fecdd3" },
      dark: { primary: "#fb7185", accent: "#fbbf24", background: "#0c0a09", surface: "#1c1917", text: "#fafaf9", muted: "#a8a29e", border: "#292524" },
      fonts: { heading: "Space Grotesk", body: "DM Sans", base_size: 17 },
      radius: "large",
      card_style: "shadow",
      density: "comfortable",
      mode: "light",
    },
  },
  {
    id: "dark",
    name: "Dark",
    theme: {
      light: LIGHT,
      dark: { primary: "#a78bfa", accent: "#34d399", background: "#09090b", surface: "#18181b", text: "#fafafa", muted: "#a1a1aa", border: "#27272a" },
      fonts: { heading: "Manrope", body: "Manrope", base_size: 16 },
      radius: "medium",
      card_style: "bordered",
      density: "comfortable",
      mode: "dark",
    },
  },
  {
    id: "warm",
    name: "Warm",
    theme: {
      light: { primary: "#b45309", accent: "#15803d", background: "#fffbf5", surface: "#fdf3e7", text: "#292018", muted: "#6b5a4a", border: "#f0dfca" },
      dark: { primary: "#fbbf24", accent: "#4ade80", background: "#1c1410", surface: "#2a1f18", text: "#fdf6ec", muted: "#c9b8a6", border: "#3d2f24" },
      fonts: { heading: "Fraunces", body: "Nunito", base_size: 16 },
      radius: "large",
      card_style: "flat",
      density: "comfortable",
      mode: "light",
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    theme: {
      light: { primary: "#111111", accent: "#b91c1c", background: "#fafaf7", surface: "#ffffff", text: "#111111", muted: "#555555", border: "#e5e5e0" },
      dark: { primary: "#f5f5f4", accent: "#f87171", background: "#111111", surface: "#1a1a1a", text: "#f5f5f4", muted: "#a3a3a3", border: "#2e2e2e" },
      fonts: { heading: "Playfair Display", body: "Source Sans 3", base_size: 17 },
      radius: "none",
      card_style: "bordered",
      density: "comfortable",
      mode: "light",
    },
  },
];

/** Apply a preset's look while keeping the owner's branding and form overrides. */
export function applyThemePreset(current: ThemeConfig, presetId: string): ThemeConfig {
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  if (!preset) return current;
  return parseTheme({ ...current, ...preset.theme, preset: preset.id, branding: current.branding, form: current.form });
}

// ---------- Rendering helpers (shared by the public site and the live preview) ----

const RADIUS = { none: "0px", small: "6px", medium: "12px", large: "20px" } as const;

function paletteVars(p: Palette): string {
  return PALETTE_KEYS.map((k) => `--site-${k}:${p[k]};`).join("");
}

/**
 * Scoped CSS custom properties for one site. Inputs are validated hex colours and enum values only,
 * so the output can't break out of the <style> block.
 */
export function themeCss(theme: ThemeConfig, scope: string, fontStack: (name: FontName) => string = defaultFontStack): string {
  const base =
    `${scope}{` +
    `--site-radius:${RADIUS[theme.radius]};` +
    `--site-font-heading:${fontStack(theme.fonts.heading)};` +
    `--site-font-body:${fontStack(theme.fonts.body)};` +
    `--site-base:${theme.fonts.base_size}px;` +
    `--site-gap:${theme.density === "compact" ? "0.75rem" : "1.25rem"};` +
    `--site-pad:${theme.density === "compact" ? "1rem" : "1.5rem"};` +
    `${paletteVars(theme.mode === "dark" ? theme.dark : theme.light)}}`;
  if (theme.mode !== "system") return base;
  return `${base}@media (prefers-color-scheme: dark){${scope}{${paletteVars(theme.dark)}}}`;
}

/** Plain stack used where self-hosted fonts aren't available (tests, OG images). */
export function defaultFontStack(name: FontName): string {
  const f = FONTS.find((x) => x.name === name) ?? FONTS[0];
  return `'${f.name}', ${f.category}`;
}
