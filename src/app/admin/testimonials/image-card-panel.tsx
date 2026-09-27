"use client";

import { useEffect, useState } from "react";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

const SIZES = [
  { key: "square", label: "Square", hint: "1080×1080", ratio: "1 / 1" },
  { key: "landscape", label: "Landscape", hint: "1200×627", ratio: "1200 / 627" },
  { key: "story", label: "Story", hint: "1080×1920", ratio: "9 / 16" },
] as const;
const DESIGNS = [
  { key: "classic", label: "Classic" },
  { key: "bold", label: "Bold" },
  { key: "minimal", label: "Minimal" },
] as const;

/**
 * Export the saved testimonial as a PNG (brief §5.4). The preview is fetched first so a consent
 * problem is shown as a message instead of a broken image.
 */
export function ImageCardPanel({ testimonialId, version }: { testimonialId: string; version: string }) {
  const [size, setSize] = useState<(typeof SIZES)[number]["key"]>("square");
  const [design, setDesign] = useState<(typeof DESIGNS)[number]["key"]>("classic");
  const src = `/admin/testimonials/${testimonialId}/card?size=${size}&design=${design}&v=${encodeURIComponent(version)}`;
  // The last finished render; it's "loading" while that isn't for the current settings.
  const [result, setResult] = useState<{ src: string; url: string | null; error: string | null } | null>(null);
  const preview = { url: result?.url ?? null, error: result?.error ?? null, loading: result?.src !== src };

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    fetch(src)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setResult({ src, url: null, error: (await res.text()) || "Couldn't render the card." });
          return;
        }
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setResult({ src, url: objectUrl, error: null });
      })
      .catch(() => {
        if (!cancelled) setResult({ src, url: null, error: "Couldn't render the card." });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const chip = (active: boolean) =>
    cn("rounded-md px-2.5 py-1 text-xs", active ? "bg-slate-900 text-white" : "text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100");
  const ratio = SIZES.find((s) => s.key === size)!.ratio;

  return (
    <Card>
      <CardHeader title="Image card" description="Share this testimonial as an image, using your site's colours and fonts. Uses the saved version." />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Size">
            {SIZES.map((s) => (
              <button key={s.key} type="button" aria-pressed={size === s.key} onClick={() => setSize(s.key)} className={chip(size === s.key)} title={s.hint}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Design">
            {DESIGNS.map((d) => (
              <button key={d.key} type="button" aria-pressed={design === d.key} onClick={() => setDesign(d.key)} className={chip(design === d.key)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mx-auto max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-slate-100" style={{ aspectRatio: ratio, maxHeight: 480 }}>
          {preview.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt="Image card preview" className={cn("size-full object-contain transition-opacity", preview.loading && "opacity-50")} />
          ) : (
            <p className="flex size-full items-center justify-center p-4 text-center text-sm text-slate-500">
              {preview.loading ? "Drawing…" : preview.error}
            </p>
          )}
        </div>
        {preview.url && (
          <a href={`${src}&download=1`} className={buttonClass("outline", "sm")} download>
            Download PNG ({SIZES.find((s) => s.key === size)!.hint})
          </a>
        )}
      </div>
    </Card>
  );
}
