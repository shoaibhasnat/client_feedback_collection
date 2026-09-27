import { describe, expect, it } from "vitest";
import { applyThemePreset, parseLayout, parseSeo, parseTheme, themeCss, validAnalytics } from "@/lib/site/config";
import { filterTestimonials, resolveTag } from "@/lib/site/public-data";
import { reviewJsonLd } from "@/lib/site/seo";
import type { PublicSite, PublicTestimonial } from "@/lib/site/types";

describe("theme parsing", () => {
  it("fills every field with defaults from nothing", () => {
    const t = parseTheme(undefined);
    expect(t.mode).toBe("light");
    expect(t.light.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(t.fonts.heading).toBe("Inter");
  });

  it("replaces invalid values field by field instead of failing", () => {
    const t = parseTheme({ mode: "neon", light: { primary: "red;} body{display:none", text: "#000000" }, fonts: { heading: "Comic Sans", base_size: 99 } });
    expect(t.mode).toBe("light");
    expect(t.light.primary).toBe("#1f4fd8");
    expect(t.light.text).toBe("#000000");
    expect(t.fonts.heading).toBe("Inter");
    expect(t.fonts.base_size).toBe(16);
  });

  it("produces CSS that can't escape its <style> block", () => {
    const css = themeCss(parseTheme({ light: { primary: "</style><script>alert(1)</script>" } }), ".tc-site");
    expect(css).not.toContain("<");
    expect(css).toContain("--site-primary:#1f4fd8");
  });

  it("system mode adds a dark palette media query", () => {
    expect(themeCss(parseTheme({ mode: "system" }), ".x")).toContain("prefers-color-scheme: dark");
  });

  it("presets change the look but keep branding", () => {
    const t = applyThemePreset(parseTheme({ branding: { site_name: "Acme", logo_light: "ws/branding/l.webp" } }), "warm");
    expect(t.preset).toBe("warm");
    expect(t.fonts.heading).toBe("Fraunces");
    expect(t.branding).toMatchObject({ site_name: "Acme", logo_light: "ws/branding/l.webp" });
  });

  it("uses the provided font stacks for the chosen curated fonts", () => {
    const css = themeCss(parseTheme({ fonts: { heading: "Playfair Display", body: "Inter" } }), ".x", (n) => `stack-${n.replace(/ /g, "")}`);
    expect(css).toContain("--site-font-heading:stack-PlayfairDisplay");
    expect(css).toContain("--site-font-body:stack-Inter");
  });
});

describe("layout & SEO parsing", () => {
  it("keeps section order, drops duplicates, appends missing sections", () => {
    const l = parseLayout({ sections: [{ id: "about", visible: true }, { id: "hero", visible: true }, { id: "about", visible: false }] });
    expect(l.sections.map((s) => s.id)).toEqual(["about", "hero", "featured", "grid", "services", "logos", "cta"]);
    expect(l.sections[0].visible).toBe(true);
  });

  it("rejects unsafe CTA links", () => {
    expect(parseLayout({ content: { cta_url: "javascript:alert(1)" } }).content.cta_url).toBe("");
    expect(parseLayout({ content: { cta_url: "https://upwork.com/x" } }).content.cta_url).toBe("https://upwork.com/x");
  });

  it("accepts analytics identifiers only in the provider's format", () => {
    expect(validAnalytics(parseSeo({ analytics: { provider: "google", id: "G-ABC123" } }).analytics)).not.toBeNull();
    expect(validAnalytics(parseSeo({ analytics: { provider: "google", id: "G-1');alert(1);//" } }).analytics)).toBeNull();
    expect(validAnalytics(parseSeo({ analytics: { provider: "plausible", id: "example.com" } }).analytics)).not.toBeNull();
    expect(validAnalytics(parseSeo({ analytics: { provider: "plausible", id: "<script>" } }).analytics)).toBeNull();
  });
});

describe("filtering and structured data", () => {
  const t = (id: string, quote: string, tagIds: string[] = []): PublicTestimonial => ({
    id, quote, headline: null, name: "Ada", role: null, company: "Acme", rating: 5, date: "2026-01-01", platform: null, photo: null, logo: null, video: null, videoThumb: null, featured: false, tagIds,
  });
  const list = [t("1", "Fast Shopify store", ["tag-shop"]), t("2", "Great SEO work")];
  const tags = [{ id: "tag-shop", name: "Shopify Plus", type: "platform", color: null }];

  it("resolves tags by id, name or slug", () => {
    expect(resolveTag(tags, "tag-shop")?.id).toBe("tag-shop");
    expect(resolveTag(tags, "Shopify Plus")?.id).toBe("tag-shop");
    expect(resolveTag(tags, "shopify-plus")?.id).toBe("tag-shop");
    expect(resolveTag(tags, "nope")).toBeNull();
  });

  it("filters by tag and search", () => {
    expect(filterTestimonials(list, { tag: "tag-shop" }).map((x) => x.id)).toEqual(["1"]);
    expect(filterTestimonials(list, { q: "seo" }).map((x) => x.id)).toEqual(["2"]);
    expect(filterTestimonials(list, { tag: "__none__" })).toEqual([]);
  });

  it("JSON-LD is escaped and includes an aggregate rating", () => {
    const site = { brand: { siteName: "Acme </script>" }, profile: { tagline: "" } } as unknown as PublicSite;
    const json = reviewJsonLd(site, [t("1", "Nice </script><script>alert(1)</script>")], "/acme");
    expect(json).not.toContain("</script>");
    const parsed = JSON.parse(json);
    expect(parsed.aggregateRating).toMatchObject({ ratingValue: "5.0", reviewCount: 1 });
  });
});
