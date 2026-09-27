import { ImageResponse } from "next/og";
import type { PublicSite, PublicTestimonial } from "@/lib/site/types";

// 1200×630 Open Graph cards drawn with the site's own colours (Satori: flex layout only).

const SIZE = { width: 1200, height: 630 };

function palette(site: PublicSite) {
  return site.theme.mode === "dark" ? site.theme.dark : site.theme.light;
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

export function siteOgImage(site: PublicSite) {
  const p = palette(site);
  const quote = site.testimonials.find((t) => t.featured)?.quote ?? site.testimonials[0]?.quote ?? "";
  return new ImageResponse(
    (
      <div style={{ ...SIZE, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: p.background, color: p.text }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>{clip(site.brand.siteName, 40)}</div>
          {site.profile.tagline && <div style={{ display: "flex", fontSize: 30, color: p.muted }}>{clip(site.profile.tagline, 90)}</div>}
        </div>
        {quote && (
          <div style={{ display: "flex", fontSize: 34, lineHeight: 1.35, borderLeft: `8px solid ${p.primary}`, paddingLeft: 28 }}>
            {`“${clip(quote, 170)}”`}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 30, color: p.muted }}>
          <div style={{ display: "flex", color: p.text, fontWeight: 700 }}>{`${site.stats.count} testimonials`}</div>
          {site.stats.average !== null && (
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "#f59e0b" }}>{stars(Math.round(site.stats.average))}</span>
              <span>{`${site.stats.average.toFixed(1)} average`}</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}

export function testimonialOgImage(site: PublicSite, t: PublicTestimonial) {
  const p = palette(site);
  const who = [t.name, [t.role, t.company].filter(Boolean).join(", ")].filter((s): s is string => Boolean(s));
  return new ImageResponse(
    (
      <div style={{ ...SIZE, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: p.surface, color: p.text }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {t.rating ? <div style={{ display: "flex", fontSize: 40, color: "#f59e0b" }}>{stars(t.rating)}</div> : null}
          {t.headline && <div style={{ display: "flex", fontSize: 44, fontWeight: 700 }}>{clip(t.headline, 70)}</div>}
          <div style={{ display: "flex", fontSize: t.quote.length > 200 ? 32 : 38, lineHeight: 1.35 }}>{`“${clip(t.quote, 260)}”`}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {who.map((line, i) => (
              <div key={i} style={{ display: "flex", fontSize: i === 0 ? 32 : 26, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? p.text : p.muted }}>
                {clip(line, 60)}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: p.primary, fontWeight: 700 }}>{clip(site.brand.siteName, 30)}</div>
        </div>
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
