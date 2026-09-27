"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, GripVertical } from "lucide-react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { PublicWall, SiteFrame } from "@/components/site/public-site";
import {
  CARD_FIELDS,
  FONTS,
  PALETTE_KEYS,
  SECTION_LABELS,
  THEME_PRESETS,
  applyThemePreset,
  CUSTOM_CSS_MAX,
  customCssProblem,
  type LayoutConfig,
  type Palette,
  type SeoConfig,
  type ThemeConfig,
} from "@/lib/site/config";
import type { PublicSite } from "@/lib/site/types";
import { cn } from "@/lib/utils";
import { removeAssetAction, restoreVersionAction, saveAppearanceAction, uploadAssetAction, type AssetKind } from "./actions";

type Draft = { theme: ThemeConfig; layout: LayoutConfig; seo: SeoConfig };
type Tab = "theme" | "layout" | "content" | "branding" | "seo" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "theme", label: "Theme" },
  { key: "layout", label: "Layout" },
  { key: "content", label: "Content" },
  { key: "branding", label: "Branding" },
  { key: "seo", label: "SEO" },
  { key: "history", label: "History" },
];

export function AppearanceEditor({
  initial,
  assets: initialAssets,
  preview,
  usingSamples,
  versions,
  publicUrl,
  readOnly,
}: {
  initial: Draft;
  assets: Record<AssetKind, string | null>;
  preview: PublicSite;
  usingSamples: boolean;
  versions: { id: string; saved_at: string; preset: string }[];
  publicUrl: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [assets, setAssets] = useState(initialAssets);
  const [tab, setTab] = useState<Tab>("theme");
  const [device, setDevice] = useState<"mobile" | "desktop">("desktop");
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(draft) !== saved;

  const setTheme = (patch: Partial<ThemeConfig>) => setDraft((d) => ({ ...d, theme: { ...d.theme, ...patch, preset: patch.preset ?? "custom" } }));
  const setLayout = (patch: Partial<LayoutConfig>) => setDraft((d) => ({ ...d, layout: { ...d.layout, ...patch } }));
  const setContent = (patch: Partial<LayoutConfig["content"]>) => setDraft((d) => ({ ...d, layout: { ...d.layout, content: { ...d.layout.content, ...patch } } }));
  const setSeo = (patch: Partial<SeoConfig>) => setDraft((d) => ({ ...d, seo: { ...d.seo, ...patch } }));

  const save = () =>
    startTransition(async () => {
      const res = await saveAppearanceAction(draft);
      if (res.ok) {
        setSaved(JSON.stringify(draft));
        setMessage({ tone: "green", text: "Saved. Your public page is updated." });
        router.refresh();
      } else setMessage({ tone: "red", text: res.error ?? "Could not save." });
    });

  const previewSite: PublicSite = {
    ...preview,
    theme: draft.theme,
    layout: draft.layout,
    seo: draft.seo,
    brand: {
      siteName: draft.theme.branding.site_name || preview.profile.name || preview.workspace.name,
      logoLight: assets.logo_light,
      logoDark: assets.logo_dark,
      favicon: assets.favicon,
      ogImage: assets.og_image,
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Appearance sections" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn("rounded-md px-3 py-1.5 text-sm", tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:underline">
            View public page <ExternalLink className="size-3.5" aria-hidden />
          </a>
          {!readOnly && (
            <>
              {dirty && (
                <Button variant="ghost" size="sm" onClick={() => setDraft(JSON.parse(saved))}>
                  Discard
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={pending || !dirty}>
                {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </Button>
            </>
          )}
        </div>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid gap-6 2xl:grid-cols-[420px_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <fieldset disabled={readOnly} className="space-y-4">
            {tab === "theme" && <ThemeTab theme={draft.theme} setTheme={setTheme} setDraft={setDraft} />}
            {tab === "layout" && <LayoutTab layout={draft.layout} setLayout={setLayout} />}
            {tab === "content" && <ContentTab content={draft.layout.content} setContent={setContent} />}
            {tab === "branding" && (
              <BrandingTab
                siteName={draft.theme.branding.site_name}
                setSiteName={(site_name) => setDraft((d) => ({ ...d, theme: { ...d.theme, branding: { ...d.theme.branding, site_name } } }))}
                assets={assets}
                onAsset={(kind, url) => {
                  setAssets((a) => ({ ...a, [kind]: url }));
                  router.refresh();
                }}
                onError={(text) => setMessage({ tone: "red", text })}
              />
            )}
            {tab === "seo" && <SeoTab seo={draft.seo} setSeo={setSeo} ogImage={assets.og_image} />}
          </fieldset>
          {tab === "history" && (
            <HistoryTab
              versions={versions}
              readOnly={readOnly}
              onRestore={(id) =>
                startTransition(async () => {
                  const res = await restoreVersionAction(id);
                  setMessage(res.ok ? { tone: "green", text: "Restored. Reloading…" } : { tone: "red", text: res.error ?? "Could not restore." });
                  if (res.ok) window.location.reload();
                })
              }
            />
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-semibold text-slate-900">
                Live preview {dirty && <span className="ml-1 text-xs font-normal text-amber-700">unsaved</span>}
              </p>
              <div className="flex items-center gap-1" role="group" aria-label="Preview size">
                {(["mobile", "desktop"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={device === d}
                    onClick={() => setDevice(d)}
                    className={cn("rounded-md px-2.5 py-1 text-xs font-medium capitalize", device === d ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            {usingSamples && <p className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">Showing sample testimonials until you publish some.</p>}
            <div className="overflow-auto bg-slate-100 p-3" style={{ maxHeight: 760 }}>
              <div className={cn("mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm", device === "mobile" ? "w-[375px] max-w-full" : "w-full")}>
                <SiteFrame theme={draft.theme} customCss>
                  <PublicWall site={previewSite} list={previewSite.testimonials} activeTag={null} q="" basePath="#" mode="preview" />
                </SiteFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Theme ------------------------------------------------------------

function ColorInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(value);
  }
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
        aria-label={label}
      />
      <label htmlFor={`${id}-hex`} className="w-24 text-xs capitalize text-slate-600">
        {label}
      </label>
      <input
        id={`${id}-hex`}
        value={text}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
        className="h-8 w-24 rounded border border-slate-300 px-2 font-mono text-xs"
      />
    </div>
  );
}

function ThemeTab({
  theme,
  setTheme,
  setDraft,
}: {
  theme: ThemeConfig;
  setTheme: (p: Partial<ThemeConfig>) => void;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
}) {
  // Functional update: always merge into the latest palette, even if a preset was applied a moment ago.
  const setPalette = (which: "light" | "dark", key: keyof Palette, value: string) =>
    setDraft((d) => ({ ...d, theme: { ...d.theme, preset: "custom", [which]: { ...d.theme[which], [key]: value } } }));
  return (
    <>
      <Card>
        <CardHeader title="Presets" description="Starting points. Your logo and text are kept." />
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          {THEME_PRESETS.map((p) => {
            const pal = p.theme.mode === "dark" ? p.theme.dark! : p.theme.light!;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, theme: applyThemePreset(d.theme, p.id) }))}
                aria-pressed={theme.preset === p.id}
                className={cn("rounded-lg border p-2 text-left text-xs", theme.preset === p.id ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:border-slate-400")}
              >
                <span className="mb-1.5 flex gap-1" aria-hidden>
                  {[pal.background, pal.primary, pal.accent, pal.text].map((c, i) => (
                    <span key={i} className="size-4 rounded-full border border-slate-200" style={{ background: c }} />
                  ))}
                </span>
                {p.name}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Colours" />
        <div className="space-y-4 p-4">
          <Field label="Colour mode" htmlFor="th-mode">
            <Select id="th-mode" value={theme.mode} onChange={(e) => setTheme({ mode: e.target.value as ThemeConfig["mode"] })}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">Follow the visitor&apos;s system</option>
            </Select>
          </Field>
          {(["light", "dark"] as const).map((which) => (
            <fieldset key={which} className="space-y-1.5">
              <legend className="mb-1 text-sm font-medium capitalize text-slate-700">{which} palette</legend>
              {PALETTE_KEYS.map((k) => (
                <ColorInput key={k} id={`c-${which}-${k}`} label={k} value={theme[which][k]} onChange={(v) => setPalette(which, k, v)} />
              ))}
            </fieldset>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Typography & shape" />
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Heading font" htmlFor="th-hfont">
            <Select id="th-hfont" value={theme.fonts.heading} onChange={(e) => setTheme({ fonts: { ...theme.fonts, heading: e.target.value as ThemeConfig["fonts"]["heading"] } })}>
              {FONTS.map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Body font" htmlFor="th-bfont">
            <Select id="th-bfont" value={theme.fonts.body} onChange={(e) => setTheme({ fonts: { ...theme.fonts, body: e.target.value as ThemeConfig["fonts"]["body"] } })}>
              {FONTS.map((f) => (
                <option key={f.name}>{f.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={`Base size (${theme.fonts.base_size}px)`} htmlFor="th-size">
            <input
              id="th-size"
              type="range"
              min={14}
              max={20}
              value={theme.fonts.base_size}
              onChange={(e) => setTheme({ fonts: { ...theme.fonts, base_size: Number(e.target.value) } })}
              className="w-full"
            />
          </Field>
          <Field label="Corners" htmlFor="th-radius">
            <Select id="th-radius" value={theme.radius} onChange={(e) => setTheme({ radius: e.target.value as ThemeConfig["radius"] })}>
              <option value="none">Square</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </Select>
          </Field>
          <Field label="Card style" htmlFor="th-card">
            <Select id="th-card" value={theme.card_style} onChange={(e) => setTheme({ card_style: e.target.value as ThemeConfig["card_style"] })}>
              <option value="flat">Flat</option>
              <option value="bordered">Bordered</option>
              <option value="shadow">Shadow</option>
            </Select>
          </Field>
          <Field label="Spacing" htmlFor="th-density">
            <Select id="th-density" value={theme.density} onChange={(e) => setTheme({ density: e.target.value as ThemeConfig["density"] })}>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </Select>
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Custom CSS"
          description="Applied last, only on your public pages (not the form or widgets). Rules are scoped to your page. Handy hooks: .tc-card (each testimonial) and .tc-quote (its text)."
        />
        <div className="space-y-2 p-4">
          <label htmlFor="custom-css" className="sr-only">
            Custom CSS
          </label>
          <textarea
            id="custom-css"
            value={theme.custom_css}
            maxLength={CUSTOM_CSS_MAX}
            rows={8}
            spellCheck={false}
            onChange={(e) => {
              const custom_css = e.target.value;
              setDraft((d) => ({ ...d, theme: { ...d.theme, custom_css } }));
            }}
            className="w-full rounded-lg border border-slate-300 bg-slate-950 p-3 font-mono text-xs text-slate-100 focus:border-blue-600 focus:outline-none"
            placeholder={".tc-card { border-width: 2px; }\n.tc-quote { font-style: italic; }"}
          />
          {customCssProblem(theme.custom_css) ? (
            <p className="text-xs text-red-600">{customCssProblem(theme.custom_css)}</p>
          ) : (
            <p className="text-xs text-slate-500">
              {theme.custom_css.length.toLocaleString("en")} / {CUSTOM_CSS_MAX.toLocaleString("en")} characters. @import, script URLs and “&lt;” aren&apos;t allowed.
            </p>
          )}
        </div>
      </Card>
    </>
  );
}

// ---------- Layout -----------------------------------------------------------

function SectionRow({ id, visible, onToggle }: { id: keyof typeof SECTION_LABELS; visible: boolean; onToggle: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-center gap-3 bg-white px-3 py-2 text-sm">
      <button type="button" aria-label={`Reorder ${SECTION_LABELS[id]}`} className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100" {...attributes} {...listeners}>
        <GripVertical className="size-4" aria-hidden />
      </button>
      <span className="flex-1 text-slate-800">{SECTION_LABELS[id]}</span>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <input type="checkbox" className="size-4" checked={visible} onChange={(e) => onToggle(e.target.checked)} /> Show
      </label>
    </li>
  );
}

function LayoutTab({ layout, setLayout }: { layout: LayoutConfig; setLayout: (p: Partial<LayoutConfig>) => void }) {
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = layout.sections.map((s) => s.id);
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setLayout({ sections: arrayMove(layout.sections, ids.indexOf(e.active.id as never), ids.indexOf(e.over.id as never)) });
  };
  const card = layout.card;
  return (
    <>
      <Card>
        <CardHeader title="Sections" description="Drag to reorder; untick to hide." />
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-slate-100">
              {layout.sections.map((s) => (
                <SectionRow
                  key={s.id}
                  id={s.id}
                  visible={s.visible}
                  onToggle={(visible) => setLayout({ sections: layout.sections.map((x) => (x.id === s.id ? { ...x, visible } : x)) })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </Card>
      <Card>
        <CardHeader title="Testimonial cards" />
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Arrangement" htmlFor="ly-mode">
              <Select id="ly-mode" value={card.layout} onChange={(e) => setLayout({ card: { ...card, layout: e.target.value as "grid" | "masonry" } })}>
                <option value="masonry">Masonry</option>
                <option value="grid">Grid</option>
              </Select>
            </Field>
            <Field label="Columns on desktop" htmlFor="ly-cols">
              <Select id="ly-cols" value={card.columns} onChange={(e) => setLayout({ card: { ...card, columns: Number(e.target.value) as 2 | 3 | 4 } })}>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Show on each card</legend>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {CARD_FIELDS.map((f) => (
                <label key={f} className="flex items-center gap-1.5 capitalize">
                  <input type="checkbox" className="size-4" checked={card.fields[f]} onChange={(e) => setLayout({ card: { ...card, fields: { ...card.fields, [f]: e.target.checked } } })} />
                  {f}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Fields are always limited by each client&apos;s consent.</p>
          </fieldset>
        </div>
      </Card>
    </>
  );
}

// ---------- Content ------------------------------------------------------------

function ContentTab({ content, setContent }: { content: LayoutConfig["content"]; setContent: (p: Partial<LayoutConfig["content"]>) => void }) {
  const input = (key: keyof LayoutConfig["content"], label: string, opts: { long?: boolean; hint?: string; max?: number } = {}) => (
    <Field label={label} htmlFor={`ct-${key}`} hint={opts.hint}>
      {opts.long ? (
        <Textarea id={`ct-${key}`} rows={3} maxLength={opts.max ?? 600} value={String(content[key] ?? "")} onChange={(e) => setContent({ [key]: e.target.value })} />
      ) : (
        <Input id={`ct-${key}`} maxLength={opts.max ?? 160} value={String(content[key] ?? "")} onChange={(e) => setContent({ [key]: e.target.value })} />
      )}
    </Field>
  );
  return (
    <>
      <Card>
        <CardHeader title="Hero" />
        <div className="space-y-3 p-4">
          {input("hero_title", "Title", { hint: "Defaults to your name." })}
          {input("hero_subtitle", "Subtitle", { long: true, hint: "Defaults to your tagline.", max: 400 })}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={content.show_stats} onChange={(e) => setContent({ show_stats: e.target.checked })} />
            Show stats (count and average rating)
          </label>
          {input("cta_label", "Button text", { hint: "e.g. Hire me on Upwork, Book a call", max: 60 })}
          {input("cta_url", "Button link", { hint: "https:// or mailto: — defaults to your first contact link.", max: 2000 })}
        </div>
      </Card>
      <Card>
        <CardHeader title="Section titles & text" />
        <div className="space-y-3 p-4">
          {input("featured_title", "Featured title")}
          {input("grid_title", "Testimonials title")}
          {input("search_placeholder", "Search placeholder", { max: 80 })}
          {input("empty_text", "Empty state text", { max: 300 })}
          {input("about_title", "About title")}
          {input("about_text", "About text", { long: true, hint: "Defaults to your bio.", max: 3000 })}
          {input("services_title", "Services title")}
          {input("logos_title", "Client logos title")}
          {input("cta_title", "Footer call-to-action title")}
          {input("cta_text", "Footer call-to-action text", { long: true })}
          {input("footer_text", "Footer text", { max: 300 })}
        </div>
      </Card>
    </>
  );
}

// ---------- Branding -------------------------------------------------------------

const ASSET_INFO: { kind: AssetKind; label: string; hint: string }[] = [
  { kind: "logo_light", label: "Logo (light background)", hint: "Shown in the page header." },
  { kind: "logo_dark", label: "Logo (dark background)", hint: "Used in dark mode." },
  { kind: "favicon", label: "Favicon", hint: "Square image; resized to 64×64." },
  { kind: "og_image", label: "Social share image", hint: "1200×630. Leave empty to use an automatic card." },
  { kind: "form_background", label: "Client form background", hint: "Optional background photo for the testimonial form." },
];

function BrandingTab({
  siteName,
  setSiteName,
  assets,
  onAsset,
  onError,
}: {
  siteName: string;
  setSiteName: (v: string) => void;
  assets: Record<AssetKind, string | null>;
  onAsset: (kind: AssetKind, url: string | null) => void;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState<AssetKind | null>(null);
  return (
    <>
      <Card>
        <CardHeader title="Site name" />
        <div className="p-4">
          <Field label="Site name" htmlFor="br-name" hint="Defaults to your name. Save changes to apply.">
            <Input id="br-name" value={siteName} maxLength={80} onChange={(e) => setSiteName(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Images" description="Saved immediately when uploaded." />
        <ul className="divide-y divide-slate-100">
          {ASSET_INFO.map((a) => (
            <li key={a.kind} className="flex items-center gap-3 px-4 py-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                {assets[a.kind] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assets[a.kind]!} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-400">None</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">{a.label}</p>
                <p className="text-xs text-slate-500">{a.hint}</p>
              </div>
              <label className="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-600">
                {busy === a.kind ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="sr-only"
                  aria-label={`Upload ${a.label}`}
                  disabled={busy !== null}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setBusy(a.kind);
                    const fd = new FormData();
                    fd.append("file", file);
                    const res = await uploadAssetAction(a.kind, fd);
                    setBusy(null);
                    if (res.ok) onAsset(a.kind, res.url ?? null);
                    else onError(res.error ?? "Upload failed.");
                  }}
                />
              </label>
              {assets[a.kind] && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const res = await removeAssetAction(a.kind);
                    if (res.ok) onAsset(a.kind, null);
                    else onError(res.error ?? "Could not remove.");
                  }}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ---------- SEO ------------------------------------------------------------------

function SeoTab({ seo, setSeo, ogImage }: { seo: SeoConfig; setSeo: (p: Partial<SeoConfig>) => void; ogImage: string | null }) {
  return (
    <>
      <Card>
        <CardHeader title="Search & sharing" />
        <div className="space-y-3 p-4">
          <Field label={`Page title (${seo.title.length}/70)`} htmlFor="seo-title" hint="Defaults to “{site name} — Testimonials”.">
            <Input id="seo-title" maxLength={70} value={seo.title} onChange={(e) => setSeo({ title: e.target.value })} />
          </Field>
          <Field label={`Meta description (${seo.description.length}/200)`} htmlFor="seo-desc">
            <Textarea id="seo-desc" rows={3} maxLength={200} value={seo.description} onChange={(e) => setSeo({ description: e.target.value })} />
          </Field>
          <p className="text-xs text-slate-500">
            Social share image: {ogImage ? "custom image (Branding tab)" : "automatic card with your name, a quote and your rating"}. Review and
            AggregateRating structured data are added automatically.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={seo.noindex} onChange={(e) => setSeo({ noindex: e.target.checked })} />
            Hide from search engines (noindex)
          </label>
        </div>
      </Card>
      <Card>
        <CardHeader title="Analytics" description="Only these providers are supported — scripts can't be pasted, for security." />
        <div className="grid grid-cols-2 gap-3 p-4">
          <Field label="Provider" htmlFor="an-provider">
            <Select id="an-provider" value={seo.analytics.provider} onChange={(e) => setSeo({ analytics: { ...seo.analytics, provider: e.target.value as SeoConfig["analytics"]["provider"] } })}>
              <option value="none">None</option>
              <option value="plausible">Plausible</option>
              <option value="google">Google Analytics 4</option>
            </Select>
          </Field>
          {seo.analytics.provider !== "none" && (
            <Field label={seo.analytics.provider === "plausible" ? "Site domain" : "Measurement ID"} htmlFor="an-id">
              <Input
                id="an-id"
                value={seo.analytics.id}
                maxLength={100}
                placeholder={seo.analytics.provider === "plausible" ? "example.com" : "G-XXXXXXX"}
                onChange={(e) => setSeo({ analytics: { ...seo.analytics, id: e.target.value.trim() } })}
              />
            </Field>
          )}
        </div>
      </Card>
    </>
  );
}

// ---------- History ----------------------------------------------------------------

function HistoryTab({ versions, readOnly, onRestore }: { versions: { id: string; saved_at: string; preset: string }[]; readOnly: boolean; onRestore: (id: string) => void }) {
  return (
    <Card>
      <CardHeader title="Saved versions" description="The last 10 versions of your theme and layout. Restoring keeps your current logos and text settings." />
      <ul className="divide-y divide-slate-100">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              {new Date(v.saved_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              <span className="ml-2 text-xs capitalize text-slate-500">{v.preset}</span>
            </span>
            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm("Restore this version? Your current look is saved to history first.")) onRestore(v.id);
                }}
              >
                Restore
              </Button>
            )}
          </li>
        ))}
        {!versions.length && <li className="px-4 py-4 text-sm text-slate-500">No earlier versions yet. Each save keeps the previous one here.</li>}
      </ul>
    </Card>
  );
}
