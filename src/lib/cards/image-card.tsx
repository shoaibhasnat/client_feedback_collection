import "server-only";
import { ImageResponse } from "next/og";
import type { FontName, Palette, ThemeConfig } from "@/lib/site/config";

// Shareable image cards (brief §5.4): any testimonial as a PNG in three preset sizes and a few
// designs, drawn with the site's colours and fonts. Satori supports flexbox only and needs TTF fonts.

export const CARD_SIZES = {
  square: { width: 1080, height: 1080, label: "Square 1080×1080 (Instagram / LinkedIn)" },
  landscape: { width: 1200, height: 627, label: "Landscape 1200×627 (LinkedIn link)" },
  story: { width: 1080, height: 1920, label: "Story 1080×1920" },
} as const;
export type CardSize = keyof typeof CARD_SIZES;

export const CARD_DESIGNS = {
  classic: "Classic",
  bold: "Bold",
  minimal: "Minimal",
} as const;
export type CardDesign = keyof typeof CARD_DESIGNS;

export type CardInput = {
  quote: string;
  headline: string | null;
  name: string | null;
  role: string | null;
  company: string | null;
  rating: number | null;
  /** PNG/JPEG data URL (Satori can't decode WebP). */
  photo: string | null;
  siteName: string;
};

// ---------- Fonts ------------------------------------------------------------

type LoadedFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

/** TTF for one family/weight from Google Fonts (cached per process). Null if unavailable. */
function loadFont(family: FontName, weight: 400 | 700): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}`;
  let p = fontCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`, {
          signal: AbortSignal.timeout(5000),
        }).then((r) => (r.ok ? r.text() : ""));
        const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(css)?.[1];
        if (!url) return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        return res.ok ? await res.arrayBuffer() : null;
      } catch {
        return null;
      }
    })();
    fontCache.set(key, p);
    // Don't keep failures forever: retry on a later request.
    void p.then((data) => {
      if (!data) fontCache.delete(key);
    });
  }
  return p;
}

async function themeFonts(theme: ThemeConfig): Promise<LoadedFont[]> {
  const wanted: [FontName, 400 | 700][] = [
    [theme.fonts.heading, 700],
    [theme.fonts.body, 400],
    [theme.fonts.body, 700],
  ];
  const loaded = await Promise.all(
    wanted.map(([f, w]) => loadFont(f, w).then((data): LoadedFont | null => (data ? { name: f, data, weight: w, style: "normal" } : null))),
  );
  return loaded.filter((f): f is LoadedFont => f !== null);
}

// ---------- Drawing ----------------------------------------------------------

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function Stars({ n, size, color, empty }: { n: number; size: number; color: string; empty: string }) {
  return (
    <div style={{ display: "flex", gap: size * 0.15 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" fill={i < n ? color : empty} />
        </svg>
      ))}
    </div>
  );
}

/** Font size that keeps long quotes inside the card. */
function quoteSize(len: number, size: CardSize) {
  const base = size === "landscape" ? 44 : size === "story" ? 68 : 60;
  const scale = len < 120 ? 1 : len < 220 ? 0.84 : len < 340 ? 0.7 : 0.58;
  return Math.round(base * scale);
}

export async function renderImageCard(input: CardInput, theme: ThemeConfig, size: CardSize, design: CardDesign): Promise<ImageResponse> {
  const { width, height } = CARD_SIZES[size];
  const p: Palette = theme.mode === "dark" ? theme.dark : theme.light;
  const fonts = await themeFonts(theme);
  const heading = fonts.some((f) => f.name === theme.fonts.heading) ? theme.fonts.heading : undefined;
  const body = fonts.some((f) => f.name === theme.fonts.body) ? theme.fonts.body : undefined;

  const maxQuote = size === "landscape" ? 300 : size === "story" ? 520 : 420;
  const quote = clip(input.quote.replace(/\s+/g, " ").trim(), maxQuote);
  const qSize = quoteSize(quote.length, size);
  const pad = size === "landscape" ? 64 : 96;
  const role = [input.role, input.company].filter(Boolean).join(", ");

  const colors =
    design === "bold"
      ? { bg: p.primary, text: "#ffffff", muted: "rgba(255,255,255,0.8)", accent: "#ffffff", star: "#fde68a", starEmpty: "rgba(255,255,255,0.3)" }
      : design === "minimal"
        ? { bg: p.background, text: p.text, muted: p.muted, accent: p.primary, star: "#f59e0b", starEmpty: p.border }
        : { bg: p.surface, text: p.text, muted: p.muted, accent: p.primary, star: "#f59e0b", starEmpty: p.border };

  const author = (
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      {input.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={input.photo} width={size === "landscape" ? 88 : 112} height={size === "landscape" ? 88 : 112} style={{ borderRadius: 999, objectFit: "cover" }} alt="" />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {input.name && <div style={{ display: "flex", fontSize: size === "landscape" ? 30 : 38, fontWeight: 700, color: colors.text }}>{clip(input.name, 50)}</div>}
        {role && <div style={{ display: "flex", fontSize: size === "landscape" ? 24 : 30, color: colors.muted }}>{clip(role, 70)}</div>}
      </div>
    </div>
  );

  const card = (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        justifyContent: size === "story" ? "center" : "space-between",
        gap: size === "story" ? 80 : 0,
        padding: pad,
        background: colors.bg,
        color: colors.text,
        fontFamily: body,
        ...(design === "minimal" ? { borderLeft: `${size === "landscape" ? 18 : 24}px solid ${p.primary}` } : {}),
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: size === "landscape" ? 20 : 36 }}>
        {design !== "minimal" && (
          <div style={{ display: "flex", fontSize: size === "landscape" ? 120 : 180, lineHeight: 0.8, height: size === "landscape" ? 60 : 96, color: colors.accent, fontFamily: heading, fontWeight: 700 }}>“</div>
        )}
        {input.rating ? <Stars n={input.rating} size={size === "landscape" ? 34 : 46} color={colors.star} empty={colors.starEmpty} /> : null}
        {input.headline && (
          <div style={{ display: "flex", fontSize: Math.round(qSize * 1.05), fontWeight: 700, fontFamily: heading, lineHeight: 1.2 }}>{clip(input.headline, 80)}</div>
        )}
        <div style={{ display: "flex", fontSize: qSize, lineHeight: 1.4, fontFamily: design === "bold" ? heading : body, fontWeight: design === "bold" ? 700 : 400 }}>
          {design === "minimal" ? `“${quote}”` : quote}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: size === "story" ? "column" : "row", justifyContent: "space-between", alignItems: size === "story" ? "flex-start" : "flex-end", gap: 32 }}>
        {author}
        <div style={{ display: "flex", fontSize: size === "landscape" ? 24 : 30, fontWeight: 700, color: design === "bold" ? colors.muted : p.primary }}>{clip(input.siteName, 40)}</div>
      </div>
    </div>
  );

  return new ImageResponse(card, { width, height, fonts: fonts.length ? fonts : undefined });
}
