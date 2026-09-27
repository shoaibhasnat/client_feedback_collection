import sharp from "sharp";
import { requireOwner } from "@/lib/auth";
import { CARD_DESIGNS, CARD_SIZES, renderImageCard, type CardDesign, type CardSize } from "@/lib/cards/image-card";
import { consentViolations } from "@/lib/consent";
import type { ConsentLevel } from "@/lib/form/types";
import { parseTheme } from "@/lib/site/config";

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

/**
 * PNG image card for one of the owner's testimonials (brief §5.4). An image card is public output,
 * so it shows only the display fields and is refused when they go beyond the client's consent.
 */
export async function GET(req: Request, ctx: RouteContext<"/admin/testimonials/[id]/card">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const size = (url.searchParams.get("size") ?? "square") as CardSize;
  const design = (url.searchParams.get("design") ?? "classic") as CardDesign;
  if (!(size in CARD_SIZES) || !(design in CARD_DESIGNS)) return text("Unknown size or design.", 400);

  const { supabase, workspace } = await requireOwner();
  const [{ data: t }, { data: settings }] = await Promise.all([
    supabase
      .from("testimonials")
      .select("id, display_quote, headline, display_name, display_role, display_company, rating, photo_url, logo_url, consent_level, visibility")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("site_settings").select("theme, profile").eq("workspace_id", workspace.id).single(),
  ]);
  if (!t) return text("Testimonial not found.", 404);
  if (!t.display_quote?.trim()) return text("Write a display quote first.", 422);

  const level = t.consent_level as ConsentLevel | null;
  if (level === "private") return text("The client chose Private: this testimonial can't be shared as an image.", 422);
  const problems = consentViolations(level, { ...t, video_url: null, visibility: "published" });
  if (Object.keys(problems).length) return text(`This goes beyond what the client agreed to show: ${Object.values(problems).join(" ")}`, 422);

  // Satori can't decode WebP: convert the (workspace-owned) photo to a small PNG data URL.
  let photo: string | null = null;
  if (t.photo_url && t.photo_url.startsWith(`${workspace.id}/`)) {
    const { data } = await supabase.storage.from("uploads").download(t.photo_url);
    if (data) {
      const png = await sharp(Buffer.from(await data.arrayBuffer())).resize(224, 224, { fit: "cover" }).png().toBuffer();
      photo = `data:image/png;base64,${png.toString("base64")}`;
    }
  }

  const theme = parseTheme(settings?.theme);
  const profile = (settings?.profile ?? {}) as Record<string, unknown>;
  const siteName = theme.branding.site_name || String(profile.name ?? "") || workspace.name;
  const image = await renderImageCard(
    { quote: t.display_quote, headline: t.headline, name: t.display_name, role: t.display_role, company: t.display_company, rating: t.rating, photo, siteName },
    theme,
    size,
    design,
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "private, no-store");
  if (url.searchParams.get("download") === "1") {
    const who = (t.display_name ?? "testimonial").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "testimonial";
    headers.set("Content-Disposition", `attachment; filename="${who}-${size}-${design}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
