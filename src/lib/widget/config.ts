import { z } from "zod";
import type { PublicTestimonial } from "@/lib/site/types";

// Embeddable widget settings (brief §5.3). Stored in widgets.config and parsed field by field
// with fallbacks, so an older or damaged config never breaks a client's website.

export const WIDGET_LAYOUTS = ["grid", "carousel", "single", "marquee", "badge"] as const;
export type WidgetLayout = (typeof WIDGET_LAYOUTS)[number];
export const WIDGET_LAYOUT_LABELS: Record<WidgetLayout, string> = {
  grid: "Grid",
  carousel: "Carousel",
  single: "Single card",
  marquee: "Scrolling wall",
  badge: "Rating badge",
};

export const widgetConfigSchema = z.object({
  layout: z.enum(WIDGET_LAYOUTS).catch("grid"),
  source: z
    .object({
      type: z.enum(["all", "featured", "tag", "collection"]).catch("all"),
      id: z.uuid().nullable().catch(null),
    })
    .catch({ type: "all", id: null }),
  max_items: z.number().int().min(1).max(50).catch(9),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).catch(3),
  /** "site" follows the public page's mode; the others override it. */
  theme: z.enum(["site", "light", "dark", "auto"]).catch("site"),
  show: z
    .object({
      photo: z.boolean().catch(true),
      rating: z.boolean().catch(true),
      date: z.boolean().catch(false),
      company: z.boolean().catch(true),
      video: z.boolean().catch(true),
    })
    .catch({ photo: true, rating: true, date: false, company: true, video: true }),
  link_to_wall: z.boolean().catch(true),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export function parseWidgetConfig(raw: unknown): WidgetConfig {
  return widgetConfigSchema.parse(raw && typeof raw === "object" ? raw : {});
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = parseWidgetConfig({});

/** Pick the testimonials a widget shows, in order. Collection order comes from `collectionIds`. */
export function selectWidgetTestimonials(all: PublicTestimonial[], config: WidgetConfig, collectionIds: string[] | null): PublicTestimonial[] {
  let list: PublicTestimonial[];
  switch (config.source.type) {
    case "featured":
      list = all.filter((t) => t.featured);
      break;
    case "tag":
      list = config.source.id ? all.filter((t) => t.tagIds.includes(config.source.id!)) : [];
      break;
    case "collection": {
      const byId = new Map(all.map((t) => [t.id, t]));
      list = (collectionIds ?? []).map((id) => byId.get(id)).filter((t): t is PublicTestimonial => Boolean(t));
      break;
    }
    default:
      list = all;
  }
  return list.slice(0, config.layout === "single" ? 1 : config.max_items);
}

/** Starting iframe height so the host page doesn't jump while the widget loads (no layout shift). */
export function initialHeight(config: WidgetConfig): number {
  switch (config.layout) {
    case "badge":
      return 72;
    case "single":
      return 300;
    case "carousel":
    case "marquee":
      return 340;
    default:
      return Math.min(1200, Math.ceil(config.max_items / config.columns) * 280 + 60);
  }
}

/** The copy-paste snippets for one widget. */
export function widgetSnippets(appUrl: string, publicKey: string, widgetId: string, config: WidgetConfig) {
  const h = initialHeight(config);
  const src = `${appUrl}/embed/${publicKey}/${widgetId}`;
  return {
    script: `<div data-testimonial-widget="${publicKey}/${widgetId}" style="min-height:${h}px"></div>\n<script src="${appUrl}/widget.js" async></script>`,
    iframe: `<iframe src="${src}" title="Testimonials" loading="lazy" style="width:100%;height:${h}px;border:0" allow="fullscreen"></iframe>`,
  };
}
