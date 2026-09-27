"use client";

import { useState } from "react";
import { FormFlow } from "@/app/t/[token]/form-flow";
import { initialValues } from "@/lib/form/steps";
import type { TemplateSnapshot } from "@/lib/form/types";
import type { PublicTheme } from "@/lib/public-form";
import { cn } from "@/lib/utils";

/**
 * Renders the real client form (same component, same snapshot) in preview mode:
 * nothing is saved, uploaded or submitted. Remounts whenever the snapshot changes.
 */
export function FormPreview({
  snapshot,
  theme,
  ownerPhotoUrl,
  shareUrl,
  minutes,
  personalMessage = null,
  title = "Preview",
  note,
}: {
  snapshot: TemplateSnapshot;
  theme: PublicTheme;
  ownerPhotoUrl: string | null;
  shareUrl: string | null;
  minutes: number;
  personalMessage?: string | null;
  title?: string;
  note?: string;
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [run, setRun] = useState(0);
  const key = `${run}:${JSON.stringify([snapshot.items, snapshot.settings, snapshot.copy, personalMessage])}`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {note && <p className="text-xs text-slate-500">{note}</p>}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Preview size">
          {(["mobile", "desktop"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize",
                device === d ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {d}
            </button>
          ))}
          <button type="button" onClick={() => setRun((r) => r + 1)} className="ml-1 rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">
            Restart
          </button>
        </div>
      </div>
      <div className="overflow-auto bg-slate-100 p-3" style={{ maxHeight: 720 }}>
        <div
          className={cn("mx-auto overflow-hidden rounded-lg border border-slate-300 shadow-sm", device === "mobile" ? "w-[375px] max-w-full" : "w-full")}
          aria-label={`${title} (${device})`}
        >
          <FormFlow
            key={key}
            preview
            token="preview"
            snapshot={snapshot}
            initialValues={initialValues(snapshot)}
            initialStep={0}
            initialImageUrls={{}}
            personalMessage={personalMessage}
            ownerPhotoUrl={ownerPhotoUrl}
            shareUrl={shareUrl}
            theme={theme}
            minutes={minutes}
          />
        </div>
      </div>
    </div>
  );
}
