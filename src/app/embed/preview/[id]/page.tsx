import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WidgetView } from "@/components/site/widget-view";
import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { getPublicSite } from "@/lib/site/public-data";
import { parseWidgetConfig, selectWidgetTestimonials } from "@/lib/widget/config";

export const metadata: Metadata = { title: "Widget preview", robots: { index: false, follow: false } };

const RESIZE_SCRIPT = `(function(){var r=document.getElementById("tc-widget-root");if(!r||window.parent===window)return;var last=0;function send(){var h=Math.ceil(r.getBoundingClientRect().height);if(h!==last){last=h;window.parent.postMessage({type:"tc-widget:preview-height",height:h},location.origin)}}new ResizeObserver(send).observe(r);window.addEventListener("load",send);send()})();`;

/**
 * Builder preview (signed-in owners only): the widget with UNSAVED settings from `?c=`, rendered
 * in an iframe so its responsive layout matches the chosen preview width. Published data only.
 */
export default async function WidgetPreviewPage({ params, searchParams }: PageProps<"/embed/preview/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, workspace } = await requireOwner();
  const { data: widget } = await supabase.from("widgets").select("id").eq("id", id).maybeSingle();
  if (!widget) notFound();

  let raw: unknown = {};
  try {
    raw = typeof sp.c === "string" ? JSON.parse(sp.c.slice(0, 4000)) : {};
  } catch {
    raw = {};
  }
  const config = parseWidgetConfig(raw);
  const site = workspace.status === "active" ? await getPublicSite({ ...workspace, status: "active" }) : null;

  let collectionIds: string[] | null = null;
  if (config.source.type === "collection" && config.source.id) {
    const { data } = await supabase.from("collection_items").select("testimonial_id").eq("collection_id", config.source.id).order("sort_order");
    collectionIds = (data ?? []).map((r) => r.testimonial_id);
  }

  return (
    <div id="tc-widget-root">
      {site ? (
        <WidgetView
          config={config}
          theme={site.theme}
          list={selectWidgetTestimonials(site.testimonials, config, collectionIds)}
          stats={site.stats}
          siteName={site.brand.siteName}
          wallUrl={`${env.appUrl}/${site.workspace.slug}`}
        />
      ) : (
        <p className="p-4 text-center text-sm text-slate-500">Testimonials are not available right now.</p>
      )}
      <script dangerouslySetInnerHTML={{ __html: RESIZE_SCRIPT }} />
    </div>
  );
}
