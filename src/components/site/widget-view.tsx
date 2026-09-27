"use client";

import { useRef } from "react";
import type { CardField, ThemeConfig } from "@/lib/site/config";
import type { PublicTestimonial } from "@/lib/site/types";
import type { WidgetConfig } from "@/lib/widget/config";
import { SiteFrame, TestimonialCard } from "@/components/site/public-site";

// The embeddable widget (brief §5.3). Rendered inside an iframe on the client's website by
// /embed/{key}/{id}, and directly in the dashboard builder for the live preview.

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const GRID_COLUMNS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

/** Apply the widget's light/dark/auto choice on top of the site theme. */
export function widgetTheme(theme: ThemeConfig, choice: WidgetConfig["theme"]): ThemeConfig {
  if (choice === "site") return theme;
  return { ...theme, mode: choice === "auto" ? "system" : choice };
}

function cardFields(config: WidgetConfig): Record<CardField, boolean> {
  return {
    headline: true,
    rating: config.show.rating,
    name: true,
    role: true,
    company: config.show.company,
    photo: config.show.photo,
    logo: config.show.photo,
    platform: false,
    date: config.show.date,
    video: config.show.video,
  };
}

export function WidgetView({
  config,
  theme,
  list,
  stats,
  siteName,
  wallUrl,
}: {
  config: WidgetConfig;
  theme: ThemeConfig;
  list: PublicTestimonial[];
  stats: { count: number; average: number | null };
  siteName: string;
  /** Absolute URL of the public wall (opened in a new tab from the widget). */
  wallUrl: string | null;
}) {
  const fields = cardFields(config);
  const t = widgetTheme(theme, config.theme);
  const footer =
    config.link_to_wall && wallUrl && config.layout !== "badge" ? (
      <p className="mt-3 text-right text-[0.85em]">
        <a href={wallUrl} target="_blank" rel="noopener" className="font-medium text-[var(--site-primary)] underline-offset-2 hover:underline">
          See all testimonials →
        </a>
      </p>
    ) : null;

  let body: React.ReactNode;
  if (config.layout === "badge") {
    body = <Badge stats={stats} siteName={siteName} wallUrl={wallUrl} />;
  } else if (!list.length) {
    body = <p className="py-6 text-center text-[var(--site-muted)]">No testimonials to show yet.</p>;
  } else if (config.layout === "single") {
    body = <TestimonialCard t={list[0]} theme={t} fields={fields} size="large" />;
  } else if (config.layout === "carousel") {
    body = <Carousel list={list} theme={t} fields={fields} />;
  } else if (config.layout === "marquee") {
    body = <Marquee list={list} theme={t} fields={fields} />;
  } else {
    body = (
      <div className={cx("grid gap-x-[var(--site-gap)]", GRID_COLUMNS[config.columns])}>
        {list.map((item) => (
          <TestimonialCard key={item.id} t={item} theme={t} fields={fields} />
        ))}
      </div>
    );
  }

  return (
    <SiteFrame theme={t} className={cx(config.layout === "badge" ? "p-1" : "p-3")}>
      {body}
      {footer}
    </SiteFrame>
  );
}

function Badge({ stats, siteName, wallUrl }: { stats: { count: number; average: number | null }; siteName: string; wallUrl: string | null }) {
  const inner = (
    <>
      <span className="text-[1.3em] leading-none text-amber-500" aria-hidden>
        ★
      </span>
      <span className="font-semibold">{stats.average !== null ? stats.average.toFixed(1) : "—"}</span>
      <span className="text-[var(--site-muted)]">
        {stats.count} {stats.count === 1 ? "review" : "reviews"}
        {siteName ? ` · ${siteName}` : ""}
      </span>
    </>
  );
  const cls =
    "inline-flex items-center gap-2 rounded-full border border-[var(--site-border)] bg-[var(--site-surface)] px-4 py-2 text-[0.95em]";
  return wallUrl ? (
    <a href={wallUrl} target="_blank" rel="noopener" className={cx(cls, "hover:border-[var(--site-primary)]")} aria-label={`Rated ${stats.average ?? "–"} from ${stats.count} reviews`}>
      {inner}
    </a>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

function Carousel({ list, theme, fields }: { list: PublicTestimonial[]; theme: ThemeConfig; fields: Record<CardField, boolean> }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: "smooth" });
  const btn =
    "flex size-9 items-center justify-center rounded-full border border-[var(--site-border)] bg-[var(--site-background)] text-[var(--site-text)] hover:border-[var(--site-primary)]";
  return (
    <div role="region" aria-roledescription="carousel" aria-label="Testimonials">
      <div ref={track} className="flex snap-x snap-mandatory gap-[var(--site-gap)] overflow-x-auto scroll-smooth pb-2 [scrollbar-width:thin]" tabIndex={0}>
        {list.map((item, i) => (
          <div
            key={item.id}
            className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-var(--site-gap)/2)] lg:w-[calc(33.333%-var(--site-gap)*2/3)] [&>article]:mb-0 [&>article]:h-full"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${list.length}`}
          >
            <TestimonialCard t={item} theme={theme} fields={fields} />
          </div>
        ))}
      </div>
      {list.length > 1 && (
        <div className="mt-2 flex justify-center gap-2">
          <button type="button" className={btn} onClick={() => scroll(-1)} aria-label="Previous testimonials">
            ‹
          </button>
          <button type="button" className={btn} onClick={() => scroll(1)} aria-label="Next testimonials">
            ›
          </button>
        </div>
      )}
    </div>
  );
}

/** Continuous scrolling row. Pauses on hover/focus; with reduced motion it becomes a plain scrollable row. */
function Marquee({ list, theme, fields }: { list: PublicTestimonial[]; theme: ThemeConfig; fields: Record<CardField, boolean> }) {
  const seconds = Math.max(20, list.length * 8);
  return (
    <div className="tc-marquee overflow-hidden motion-reduce:overflow-x-auto" aria-label="Testimonials">
      <style>{`.tc-marquee-track{animation:tc-marquee ${seconds}s linear infinite}.tc-marquee:hover .tc-marquee-track,.tc-marquee:focus-within .tc-marquee-track{animation-play-state:paused}@keyframes tc-marquee{to{transform:translateX(-50%)}}@media (prefers-reduced-motion:reduce){.tc-marquee-track{animation:none}}`}</style>
      <div className="tc-marquee-track flex w-max items-start gap-[var(--site-gap)]">
        {[...list, ...list].map((item, i) => (
          <div key={`${item.id}-${i}`} className="w-80 shrink-0 [&>article]:mb-0" aria-hidden={i >= list.length || undefined}>
            <TestimonialCard t={item} theme={theme} fields={fields} />
          </div>
        ))}
      </div>
    </div>
  );
}
