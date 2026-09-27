import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WidgetView } from "@/components/site/widget-view";
import { env } from "@/lib/env";
import { getPublicSite, getPublicWidget } from "@/lib/site/public-data";
import { parseWidgetConfig, selectWidgetTestimonials } from "@/lib/widget/config";

export const metadata: Metadata = { title: "Testimonials", robots: { index: false, follow: false } };

// Reports the widget's height to the host page (widget.js) so the iframe fits its content.
// Only a number is sent; nothing else crosses the frame boundary.
const RESIZE_SCRIPT = `(function(){var r=document.getElementById("tc-widget-root");if(!r||window.parent===window)return;var id=r.getAttribute("data-id"),last=0;function send(){var h=Math.ceil(r.getBoundingClientRect().height);if(h!==last){last=h;window.parent.postMessage({type:"tc-widget:height",id:id,height:h},"*")}}new ResizeObserver(send).observe(r);window.addEventListener("load",send);send()})();`;

/** The widget page loaded inside the iframe on a client's website (brief §5.3). */
export default async function EmbedPage({ params }: PageProps<"/embed/[key]/[widget]">) {
  const { key, widget: widgetId } = await params;
  const widget = await getPublicWidget(key, widgetId);
  if (!widget) notFound();

  let content: React.ReactNode;
  if (widget.workspace.status !== "active") {
    // Suspended workspace: a neutral message, no testimonials (brief §10.5).
    content = <p className="p-4 text-center text-sm text-slate-500">Testimonials are not available right now.</p>;
  } else {
    const site = await getPublicSite({ ...widget.workspace, status: "active" });
    if (!site) notFound();
    const config = parseWidgetConfig(widget.config);
    content = (
      <WidgetView
        config={config}
        theme={site.theme}
        list={selectWidgetTestimonials(site.testimonials, config, widget.collection_ids)}
        stats={site.stats}
        siteName={site.brand.siteName}
        wallUrl={`${env.appUrl}/${site.workspace.slug}`}
      />
    );
  }

  return (
    <div id="tc-widget-root" data-id={`${key}/${widgetId}`} className="bg-transparent">
      {content}
      <script dangerouslySetInnerHTML={{ __html: RESIZE_SCRIPT }} />
    </div>
  );
}
