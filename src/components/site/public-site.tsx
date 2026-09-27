import NextImage from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { CardField, LayoutConfig, ThemeConfig } from "@/lib/site/config";
import { googleFontsHref, themeCss } from "@/lib/site/config";
import type { PublicSite, PublicTag, PublicTestimonial } from "@/lib/site/types";

// Presentational components for the public wall, collections and single-testimonial pages.
// No data access here: the public routes and the dashboard's live preview render the same markup.

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** next/image (resized, AVIF/WebP) for our own media routes; a plain lazy <img> for anything else (e.g. preview URLs). */
function Image(props: { src: string; alt: string; width: number; height: number; sizes?: string; className?: string; priority?: boolean }) {
  if (props.src.startsWith("/")) return <NextImage {...props} />;
  const { priority, sizes: _sizes, ...rest } = props;
  void _sizes;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...rest} alt={props.alt} loading={priority ? "eager" : "lazy"} decoding="async" />;
}


const COLUMN_CLASSES = {
  grid: { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" },
  masonry: { 2: "sm:columns-2", 3: "sm:columns-2 lg:columns-3", 4: "sm:columns-2 lg:columns-4" },
} as const;

const PLATFORM_LABEL: Record<string, string> = { upwork: "Upwork", referral: "Referral", direct: "Direct", other: "" };

export type SiteLinkMode = "live" | "preview";

/** Theme variables + fonts for one site, scoped to `.tc-site`. */
export function SiteFrame({ theme, children, className }: { theme: ThemeConfig; children: ReactNode; className?: string }) {
  return (
    <div
      className={cx("tc-site min-h-full bg-[var(--site-background)] text-[var(--site-text)]", className)}
      style={{ fontFamily: "var(--site-font-body)", fontSize: "var(--site-base)" } as CSSProperties}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={googleFontsHref(theme)} precedence="default" />
      {/* Validated hex colours and enum values only — see themeCss(). */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(theme, ".tc-site") }} />
      {children}
    </div>
  );
}

function Stars({ rating, label = true }: { rating: number; label?: boolean }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={label ? `Rated ${rating} out of 5` : undefined} role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={cx("size-4", i < rating ? "fill-current" : "fill-[var(--site-border)]")} aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function TestimonialCard({
  t,
  theme,
  fields,
  size = "normal",
  href,
}: {
  t: PublicTestimonial;
  theme: ThemeConfig;
  fields: Record<CardField, boolean>;
  size?: "normal" | "large";
  href?: string | null;
}) {
  const role = [fields.role ? t.role : null, fields.company ? t.company : null].filter(Boolean).join(", ");
  const platform = fields.platform && t.platform ? PLATFORM_LABEL[t.platform] : "";
  const date = fields.date ? formatDate(t.date) : null;
  const cardStyle = {
    flat: "bg-[var(--site-surface)]",
    bordered: "border border-[var(--site-border)] bg-[var(--site-background)]",
    shadow: "bg-[var(--site-background)] shadow-[0_8px_30px_rgba(0,0,0,0.08)]",
  }[theme.card_style];

  return (
    <article
      className={cx("mb-[var(--site-gap)] flex break-inside-avoid flex-col gap-3 rounded-[var(--site-radius)] p-[var(--site-pad)]", cardStyle)}
    >
      {fields.headline && t.headline && (
        <h3 className="text-[1.05em] font-semibold leading-snug" style={{ fontFamily: "var(--site-font-heading)" }}>
          {t.headline}
        </h3>
      )}
      {fields.rating && t.rating ? <Stars rating={t.rating} /> : null}
      <blockquote className={cx("leading-relaxed", size === "large" && "text-[1.15em]")}>
        <p className="whitespace-pre-line">“{t.quote}”</p>
      </blockquote>
      <footer className="mt-auto flex items-center gap-3 pt-2">
        {fields.photo && t.photo && (
          <Image src={t.photo} alt="" width={44} height={44} sizes="44px" className="size-11 shrink-0 rounded-full object-cover" />
        )}
        <div className="min-w-0 flex-1">
          {fields.name && t.name && <p className="truncate font-semibold">{t.name}</p>}
          {role && <p className="truncate text-[0.9em] text-[var(--site-muted)]">{role}</p>}
          {(platform || date) && (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.8em] text-[var(--site-muted)]">
              {platform && <span className="rounded-full border border-[var(--site-border)] px-2 py-px">{platform}</span>}
              {date && <span>{date}</span>}
            </p>
          )}
        </div>
        {fields.logo && t.logo && (
          <Image src={t.logo} alt={t.company ? `${t.company} logo` : ""} width={72} height={32} sizes="72px" className="h-8 w-auto max-w-20 shrink-0 object-contain" />
        )}
      </footer>
      {href && (
        <a href={href} className="text-[0.8em] text-[var(--site-muted)] underline-offset-2 hover:underline">
          Share this testimonial
        </a>
      )}
    </article>
  );
}

export function CardList({ list, theme, layout, linkFor }: { list: PublicTestimonial[]; theme: ThemeConfig; layout: LayoutConfig; linkFor?: (t: PublicTestimonial) => string | null }) {
  const { layout: mode, columns, fields } = layout.card;
  const cls = mode === "grid" ? cx("grid gap-x-[var(--site-gap)]", COLUMN_CLASSES.grid[columns]) : cx("gap-[var(--site-gap)]", COLUMN_CLASSES.masonry[columns]);
  return (
    <div className={cls}>
      {list.map((t) => (
        <TestimonialCard key={t.id} t={t} theme={theme} fields={fields} href={linkFor?.(t) ?? null} />
      ))}
    </div>
  );
}

function SiteLogo({ site }: { site: PublicSite }) {
  const { logoLight, logoDark, siteName } = site.brand;
  const mode = site.theme.mode;
  const primary = mode === "dark" ? (logoDark ?? logoLight) : (logoLight ?? logoDark);
  if (!primary) return <span className="text-lg font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>{siteName}</span>;
  return (
    <picture>
      {mode === "system" && logoDark && <source srcSet={logoDark} media="(prefers-color-scheme: dark)" />}
      <img src={primary} alt={siteName} className="h-8 w-auto max-w-48 object-contain" width={160} height={32} />
    </picture>
  );
}

function Button({ href, children, mode }: { href: string; children: ReactNode; mode: SiteLinkMode }) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={mode === "preview" ? undefined : href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="inline-flex h-11 items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-primary)] px-6 font-semibold text-[var(--site-background)] hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)]"
    >
      {children}
    </a>
  );
}

function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-5 text-[1.5em] font-semibold tracking-tight" style={{ fontFamily: "var(--site-font-heading)" }}>
      {children}
    </h2>
  );
}

export function FilterBar({
  tags,
  activeTag,
  q,
  basePath,
  placeholder,
  mode,
}: {
  tags: PublicTag[];
  activeTag: PublicTag | null;
  q: string;
  basePath: string;
  placeholder: string;
  mode: SiteLinkMode;
}) {
  const tagParam = (t: PublicTag) => t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const href = (tag: PublicTag | null) => {
    const p = new URLSearchParams();
    if (tag) p.set("tag", tagParam(tag));
    if (q) p.set("q", q);
    const s = p.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    cx(
      "rounded-full border px-3 py-1 text-[0.85em] transition-colors",
      active
        ? "border-[var(--site-primary)] bg-[var(--site-primary)] text-[var(--site-background)]"
        : "border-[var(--site-border)] hover:border-[var(--site-primary)]",
    );
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {tags.length > 0 ? (
        <nav aria-label="Filter by tag" className="flex flex-wrap gap-2">
          <a href={mode === "preview" ? undefined : href(null)} aria-current={!activeTag ? "page" : undefined} className={chip(!activeTag)}>
            All
          </a>
          {tags.map((t) => (
            <a key={t.id} href={mode === "preview" ? undefined : href(t)} aria-current={activeTag?.id === t.id ? "page" : undefined} className={chip(activeTag?.id === t.id)}>
              {t.name}
            </a>
          ))}
        </nav>
      ) : (
        <span />
      )}
      <SearchWrap mode={mode} basePath={basePath}>
        {activeTag && <input type="hidden" name="tag" value={tagParam(activeTag)} />}
        <label htmlFor="site-search" className="sr-only">
          {placeholder}
        </label>
        <input
          id="site-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={placeholder}
          maxLength={100}
          className="h-10 w-full rounded-[var(--site-radius)] border border-[var(--site-border)] bg-[var(--site-background)] px-3 text-[0.95em] focus:border-[var(--site-primary)] focus:outline-none sm:w-64"
        />
        <button
          type={mode === "preview" ? "button" : "submit"}
          className="h-10 rounded-[var(--site-radius)] border border-[var(--site-border)] px-4 text-[0.9em] hover:border-[var(--site-primary)]"
        >
          Search
        </button>
      </SearchWrap>
    </div>
  );
}

/** A GET search form on live pages; an inert wrapper in the dashboard preview (no navigation away). */
function SearchWrap({ mode, basePath, children }: { mode: SiteLinkMode; basePath: string; children: ReactNode }) {
  if (mode === "preview") return <div className="flex gap-2">{children}</div>;
  return (
    <form action={basePath} method="get" role="search" className="flex gap-2">
      {children}
    </form>
  );
}

/** The full wall page (brief §5.1): sections in the owner's order. */
export function PublicWall({
  site,
  list,
  activeTag,
  q,
  basePath,
  mode = "live",
}: {
  site: PublicSite;
  list: PublicTestimonial[];
  activeTag: PublicTag | null;
  q: string;
  basePath: string;
  mode?: SiteLinkMode;
}) {
  const { layout, theme, profile, brand, stats } = site;
  const c = layout.content;
  const filtering = Boolean(activeTag || q);
  const featured = filtering ? [] : site.testimonials.filter((t) => t.featured).slice(0, 3);
  const featuredIds = new Set(featured.map((t) => t.id));
  const gridList = filtering ? list : list.filter((t) => !featuredIds.has(t.id));
  const logos = [...new Map(site.testimonials.filter((t) => t.logo).map((t) => [t.company ?? t.id, t])).values()].slice(0, 12);
  const linkFor = (t: PublicTestimonial) => (mode === "live" ? `/${site.workspace.slug}/t/view/${t.id}` : null);
  const ctaHref = c.cta_url || profile.contactLinks[0] || "";

  const sections: Record<string, ReactNode> = {
    hero: (
      <header className="py-12 text-center sm:py-16">
        {profile.photo && (
          <Image src={profile.photo} alt={profile.name} width={96} height={96} sizes="96px" priority className="mx-auto mb-5 size-24 rounded-full object-cover" />
        )}
        <h1 className="text-[2.2em] font-bold leading-tight tracking-tight sm:text-[2.6em]" style={{ fontFamily: "var(--site-font-heading)" }}>
          {c.hero_title || profile.name || brand.siteName}
        </h1>
        {(c.hero_subtitle || profile.tagline) && <p className="mx-auto mt-3 max-w-2xl text-[1.1em] text-[var(--site-muted)]">{c.hero_subtitle || profile.tagline}</p>}
        {c.show_stats && stats.count > 0 && (
          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.95em] text-[var(--site-muted)]">
            <span>
              <strong className="text-[var(--site-text)]">{stats.count}</strong> {stats.count === 1 ? "testimonial" : "testimonials"}
            </span>
            {stats.average !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <strong className="text-[var(--site-text)]">{stats.average.toFixed(1)}</strong> average <Stars rating={Math.round(stats.average)} label={false} />
                </span>
              </>
            )}
          </p>
        )}
        {c.cta_label && ctaHref && (
          <div className="mt-7">
            <Button href={ctaHref} mode={mode}>
              {c.cta_label}
            </Button>
          </div>
        )}
      </header>
    ),
    featured:
      featured.length > 0 ? (
        <section aria-labelledby="featured-title" className="py-8">
          <SectionTitle id="featured-title">{c.featured_title}</SectionTitle>
          <div className={cx("grid gap-[var(--site-gap)]", featured.length > 1 && "md:grid-cols-2", featured.length > 2 && "lg:grid-cols-3")}>
            {featured.map((t) => (
              <TestimonialCard key={t.id} t={t} theme={theme} fields={layout.card.fields} size="large" href={linkFor(t)} />
            ))}
          </div>
        </section>
      ) : null,
    grid: (
      <section aria-labelledby="grid-title" className="py-8">
        <SectionTitle id="grid-title">{c.grid_title}</SectionTitle>
        <FilterBar tags={site.tags} activeTag={activeTag} q={q} basePath={basePath} placeholder={c.search_placeholder} mode={mode} />
        {filtering && (
          <p className="mb-4 text-[0.9em] text-[var(--site-muted)]" aria-live="polite">
            {list.length} {list.length === 1 ? "result" : "results"}
            {activeTag && <> for “{activeTag.name}”</>}
            {q && <> matching “{q}”</>}
          </p>
        )}
        {gridList.length ? <CardList list={gridList} theme={theme} layout={layout} linkFor={linkFor} /> : <p className="py-10 text-center text-[var(--site-muted)]">{c.empty_text}</p>}
      </section>
    ),
    about:
      c.about_text || profile.bio ? (
        <section aria-labelledby="about-title" className="py-8">
          <SectionTitle id="about-title">{c.about_title}</SectionTitle>
          <p className="max-w-3xl whitespace-pre-line leading-relaxed">{c.about_text || profile.bio}</p>
        </section>
      ) : null,
    services:
      profile.services.length > 0 ? (
        <section aria-labelledby="services-title" className="py-8">
          <SectionTitle id="services-title">{c.services_title}</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {profile.services.map((s) => (
              <li key={s} className="rounded-[var(--site-radius)] bg-[var(--site-surface)] px-4 py-2">
                {s}
              </li>
            ))}
          </ul>
        </section>
      ) : null,
    logos:
      logos.length > 0 ? (
        <section aria-labelledby="logos-title" className="py-8">
          <SectionTitle id="logos-title">{c.logos_title}</SectionTitle>
          <ul className="flex flex-wrap items-center gap-8 opacity-80">
            {logos.map((t) => (
              <li key={t.id}>
                <Image src={t.logo!} alt={t.company ?? "Client logo"} width={120} height={40} sizes="120px" className="h-10 w-auto max-w-32 object-contain" />
              </li>
            ))}
          </ul>
        </section>
      ) : null,
    cta:
      c.cta_title || (c.cta_label && ctaHref) ? (
        <section className="my-10 rounded-[var(--site-radius)] bg-[var(--site-surface)] px-6 py-10 text-center">
          {c.cta_title && (
            <h2 className="text-[1.6em] font-semibold" style={{ fontFamily: "var(--site-font-heading)" }}>
              {c.cta_title}
            </h2>
          )}
          {c.cta_text && <p className="mx-auto mt-2 max-w-xl text-[var(--site-muted)]">{c.cta_text}</p>}
          {c.cta_label && ctaHref && (
            <div className="mt-6">
              <Button href={ctaHref} mode={mode}>
                {c.cta_label}
              </Button>
            </div>
          )}
        </section>
      ) : null,
  };

  return (
    <>
      <div className="border-b border-[var(--site-border)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <SiteLogo site={site} />
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-5">
        {layout.sections
          .filter((s) => s.visible && sections[s.id])
          .map((s) => (
            <div key={s.id}>{sections[s.id]}</div>
          ))}
      </main>
      <footer className="mt-10 border-t border-[var(--site-border)]">
        <div className="mx-auto max-w-6xl px-5 py-6 text-[0.85em] text-[var(--site-muted)]">
          {c.footer_text || `© ${brand.siteName}`}
        </div>
      </footer>
    </>
  );
}
