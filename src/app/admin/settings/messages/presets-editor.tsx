"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Alert, Button, Input, Select } from "@/components/ui";
import type { FormPreset } from "@/lib/form/types";
import { savePresetsAction } from "../actions";

export function PresetsEditor({ initial, readOnly }: { initial: FormPreset[]; readOnly: boolean }) {
  const [presets, setPresets] = useState(initial);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const update = (i: number, patch: Partial<FormPreset>) => setPresets((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {presets.map((p, i) => (
        <fieldset key={p.id} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <legend className="sr-only">Preset {i + 1}</legend>
          <div className="flex items-center gap-2">
            <label htmlFor={`preset-${i}-name`} className="sr-only">
              Preset name
            </label>
            <Input id={`preset-${i}-name`} value={p.name} maxLength={80} disabled={readOnly} onChange={(e) => update(i, { name: e.target.value })} />
            {!readOnly && (
              <Button variant="ghost" size="sm" aria-label={`Remove preset ${p.name}`} onClick={() => setPresets((ps) => ps.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Star rating</span>
              <Select value={p.rating} disabled={readOnly} onChange={(e) => update(i, { rating: e.target.value as FormPreset["rating"] })}>
                <option value="default">Keep default</option>
                <option value="shown">Show</option>
                <option value="hidden">Hide</option>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Questions shown</span>
              <Select
                value={p.questions_limit === null ? "all" : String(p.questions_limit)}
                disabled={readOnly}
                onChange={(e) => update(i, { questions_limit: e.target.value === "all" ? null : Number(e.target.value) })}
              >
                <option value="all">All</option>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    First {n}
                  </option>
                ))}
              </Select>
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">Hide sections</span>
              {(["about", "contact"] as const).map((s) => (
                <label key={s} className="mr-3 inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="size-4"
                    disabled={readOnly}
                    checked={p.sections_hidden.includes(s)}
                    onChange={(e) =>
                      update(i, { sections_hidden: e.target.checked ? [...p.sections_hidden, s] : p.sections_hidden.filter((x) => x !== s) })
                    }
                  />
                  {s === "about" ? "About you" : "Contact"}
                </label>
              ))}
            </div>
          </div>
        </fieldset>
      ))}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={presets.length >= 10}
            onClick={() =>
              setPresets((ps) => [...ps, { id: `p${Date.now().toString(36)}`, name: "New preset", rating: "default", questions_limit: null, sections_hidden: [] }])
            }
          >
            Add preset
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await savePresetsAction(presets);
                setMessage(res.ok ? { tone: "green", text: "Presets saved." } : { tone: "red", text: res.error ?? "Could not save." });
              })
            }
          >
            Save presets
          </Button>
        </div>
      )}
    </div>
  );
}
