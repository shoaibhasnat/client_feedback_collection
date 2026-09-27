"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { CopyButton } from "@/components/ui/client";
import { cn } from "@/lib/utils";
import { WIDGET_LAYOUT_LABELS, WIDGET_LAYOUTS, initialHeight, widgetSnippets, type WidgetConfig } from "@/lib/widget/config";
import { saveWidgetAction } from "../actions";

const WIDTHS = { desktop: "100%", tablet: "768px", mobile: "375px" } as const;

export function WidgetBuilder({
  id,
  initialName,
  initialConfig,
  publishedCount,
  tags,
  collections,
  appUrl,
  publicKey,
  readOnly,
}: {
  id: string;
  initialName: string;
  initialConfig: WidgetConfig;
  publishedCount: number;
  tags: { id: string; name: string }[];
  collections: { id: string; name: string }[];
  appUrl: string;
  publicKey: string;
  readOnly: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [config, setConfig] = useState<WidgetConfig>(initialConfig);
  const [saved, setSaved] = useState<WidgetConfig>(initialConfig);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [width, setWidth] = useState<keyof typeof WIDTHS>("desktop");
  const [previewHeight, setPreviewHeight] = useState(initialHeight(initialConfig));
  const frame = useRef<HTMLIFrameElement>(null);

  const set = (patch: Partial<WidgetConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const setShow = (key: keyof WidgetConfig["show"], value: boolean) => setConfig((c) => ({ ...c, show: { ...c.show, [key]: value } }));

  // Debounce the preview URL so typing in "max items" doesn't reload the iframe on every keystroke.
  const encoded = JSON.stringify(config);
  const [previewConfig, setPreviewConfig] = useState(encoded);
  useEffect(() => {
    const t = setTimeout(() => setPreviewConfig(encoded), 350);
    return () => clearTimeout(t);
  }, [encoded]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "tc-widget:preview-height") setPreviewHeight(Math.max(40, Math.min(4000, Number(e.data.height) || 0)));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const snippets = useMemo(() => widgetSnippets(appUrl, publicKey, id, saved), [appUrl, publicKey, id, saved]);
  const dirty = encoded !== JSON.stringify(saved) || name !== initialName;

  const save = () =>
    start(async () => {
      const res = await saveWidgetAction(id, { name, config });
      if (res.ok) {
        setSaved(config);
        setMessage({ tone: "green", text: "Saved. Websites using this widget update within a few minutes." });
      } else setMessage({ tone: "red", text: res.error ?? "Couldn't save." });
    });

  const needsPick = (config.source.type === "tag" || config.source.type === "collection") && !config.source.id;

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Settings" />
          <fieldset disabled={readOnly} className="space-y-4 p-5">
            <Field label="Name" htmlFor="w-name" hint="Only you see this.">
              <Input id="w-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Layout</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Layout">
                {WIDGET_LAYOUTS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={config.layout === l}
                    onClick={() => set({ layout: l })}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm",
                      config.layout === l ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400",
                    )}
                  >
                    {WIDGET_LAYOUT_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>

            {config.layout !== "badge" && (
              <>
                <Field label="Which testimonials" htmlFor="w-source">
                  <Select
                    id="w-source"
                    value={config.source.type}
                    onChange={(e) => set({ source: { type: e.target.value as WidgetConfig["source"]["type"], id: null } })}
                  >
                    <option value="all">All published</option>
                    <option value="featured">Featured only</option>
                    <option value="tag">One tag</option>
                    <option value="collection">A collection</option>
                  </Select>
                </Field>
                {config.source.type === "tag" && (
                  <Field label="Tag" htmlFor="w-tag" error={needsPick ? "Choose a tag." : undefined}>
                    <Select id="w-tag" value={config.source.id ?? ""} onChange={(e) => set({ source: { type: "tag", id: e.target.value || null } })}>
                      <option value="">Choose…</option>
                      {tags.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {config.source.type === "collection" && (
                  <Field label="Collection" htmlFor="w-col" error={needsPick ? "Choose a collection." : undefined}>
                    <Select id="w-col" value={config.source.id ?? ""} onChange={(e) => set({ source: { type: "collection", id: e.target.value || null } })}>
                      <option value="">Choose…</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {config.layout !== "single" && (
                    <Field label="Max items" htmlFor="w-max">
                      <Input
                        id="w-max"
                        type="number"
                        min={1}
                        max={50}
                        value={config.max_items}
                        onChange={(e) => set({ max_items: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
                      />
                    </Field>
                  )}
                  {config.layout === "grid" && (
                    <Field label="Columns" htmlFor="w-cols" hint="On wide screens.">
                      <Select id="w-cols" value={config.columns} onChange={(e) => set({ columns: Number(e.target.value) as WidgetConfig["columns"] })}>
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
              </>
            )}

            <Field label="Theme" htmlFor="w-theme">
              <Select id="w-theme" value={config.theme} onChange={(e) => set({ theme: e.target.value as WidgetConfig["theme"] })}>
                <option value="site">Same as my public page</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto (follow the visitor&apos;s system)</option>
              </Select>
            </Field>

            {config.layout !== "badge" && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700">Show</legend>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(
                    [
                      ["photo", "Photos & logos"],
                      ["rating", "Star ratings"],
                      ["date", "Dates"],
                      ["company", "Company"],
                      ["video", "Videos"],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2">
                      <input type="checkbox" className="size-4" checked={config.show[k]} onChange={(e) => setShow(k, e.target.checked)} />
                      {label}
                    </label>
                  ))}
                  <label className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" className="size-4" checked={config.link_to_wall} onChange={(e) => set({ link_to_wall: e.target.checked })} />
                    “See all testimonials” link to my public page
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">Each client&apos;s consent still limits what is shown.</p>
              </fieldset>
            )}

            {message && <Alert tone={message.tone}>{message.text}</Alert>}
            {!readOnly && (
              <Button type="button" onClick={save} disabled={pending || needsPick || !dirty}>
                {pending ? "Saving…" : dirty ? "Save widget" : "Saved"}
              </Button>
            )}
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Embed it" description="Paste one of these into your website's HTML (in WordPress: a “Custom HTML” block)." />
          <div className="space-y-4 p-5">
            {dirty && <Alert tone="amber">Save first: the snippet always shows the last saved version.</Alert>}
            {(
              [
                ["Script (recommended)", snippets.script, "Resizes itself to fit."],
                ["iframe", snippets.iframe, "For sites that don't allow scripts. Fixed height."],
              ] as const
            ).map(([label, code, hint]) => (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <CopyButton text={code} label="Copy" />
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{code}</pre>
                <p className="mt-1 text-xs text-slate-500">{hint}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="Live preview"
          description={publishedCount ? "Only published testimonials appear." : "Publish a testimonial to see it here."}
          action={
            <div className="flex gap-1" role="group" aria-label="Preview width">
              {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={width === w}
                  onClick={() => setWidth(w)}
                  className={cn("rounded-md px-2.5 py-1 text-xs capitalize", width === w ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
                >
                  {w}
                </button>
              ))}
            </div>
          }
        />
        <div className="overflow-x-auto bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:20px_20px] p-4">
          <iframe
            ref={frame}
            title="Widget preview"
            src={`/embed/preview/${id}?c=${encodeURIComponent(previewConfig)}`}
            className="mx-auto block border-0 bg-transparent"
            style={{ width: WIDTHS[width], maxWidth: "100%", height: previewHeight }}
          />
        </div>
      </Card>
    </div>
  );
}
