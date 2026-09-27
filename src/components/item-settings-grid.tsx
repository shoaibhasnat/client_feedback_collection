"use client";

import { Lock } from "lucide-react";
import { CLIENT_FIELD_LABELS, PROJECT_FIELD_LABELS } from "@/lib/form/catalog";
import { NO_PREFILL_TYPES, resolveSettings } from "@/lib/form/settings";
import type { FormItemRow, ItemSettings, PrefillSource } from "@/lib/form/types";
import { CONSENT_KEY, RATING_KEY } from "@/lib/form/types";
import { cn } from "@/lib/utils";

export type GridRow = Pick<FormItemRow, "key" | "label" | "section" | "type" | "options" | "maps_to_client_field">;
type Custom = { key: string; label: string };

const selectClass =
  "h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50 disabled:text-slate-400";

/**
 * The four per-item settings from brief §3.7 for every question, field, and the rating/consent steps.
 * `baseline` marks what the owner has changed; `prefillValues` shows what will actually be filled.
 */
export function ItemSettingsGrid({
  rows,
  settings,
  baseline,
  prefillValues,
  onChange,
  choices,
  hasProject = true,
  disabled = false,
}: {
  rows: GridRow[];
  settings: Record<string, ItemSettings>;
  baseline: Record<string, ItemSettings>;
  prefillValues?: Record<string, string | null>;
  onChange: (key: string, next: ItemSettings) => void;
  choices: { clientCustom: Custom[]; projectCustom: Custom[] };
  hasProject?: boolean;
  disabled?: boolean;
}) {
  const clientOptions = [
    ...Object.entries(CLIENT_FIELD_LABELS).map(([value, label]) => ({ value, label })),
    ...choices.clientCustom.map((c) => ({ value: `custom:${c.key}`, label: `${c.label} (custom)` })),
  ];
  const projectOptions = [
    ...Object.entries(PROJECT_FIELD_LABELS).map(([value, label]) => ({ value, label })),
    ...choices.projectCustom.map((c) => ({ value: `custom:${c.key}`, label: `${c.label} (custom)` })),
  ];

  const set = (key: string, patch: Partial<ItemSettings>) => onChange(key, resolveSettings(settings[key], patch));

  const groups: { title: string; rows: (GridRow | { key: string; label: string; section: "step" })[] }[] = [
    {
      title: "Steps",
      rows: [
        { key: RATING_KEY, label: "Star rating", section: "step" },
        { key: CONSENT_KEY, label: "Consent", section: "step" },
      ],
    },
    { title: "Questions", rows: rows.filter((r) => r.section === "question") },
    { title: "About you", rows: rows.filter((r) => r.section === "about") },
    { title: "Contact (private)", rows: rows.filter((r) => r.section === "contact") },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Visibility</th>
            <th className="px-3 py-2 font-medium">Requirement</th>
            <th className="px-3 py-2 font-medium">Prefill</th>
            <th className="px-3 py-2 font-medium">Mode</th>
          </tr>
        </thead>
        {groups.map((g) =>
          g.rows.length === 0 ? null : (
            <tbody key={g.title} className="divide-y divide-slate-100 border-t border-slate-200">
              <tr>
                <th colSpan={5} scope="rowgroup" className="bg-slate-50/60 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {g.title}
                </th>
              </tr>
              {g.rows.map((row) => {
                const s = settings[row.key];
                const b = baseline[row.key];
                if (!s || !b) return null;
                const changed = JSON.stringify(s) !== JSON.stringify(b);
                const id = (f: string) => `set-${row.key}-${f}`;
                const isStep = row.section === "step";
                const isConsent = row.key === CONSENT_KEY;
                const canPrefill = !isStep && !NO_PREFILL_TYPES.includes((row as GridRow).type);
                const value = prefillValues?.[row.key] ?? null;

                return (
                  <tr key={row.key} className={cn(changed && "bg-amber-50/60")}>
                    <td className="max-w-64 px-3 py-2 align-top">
                      <span className="text-slate-900">{row.label}</span>
                      {changed && <span className="ml-1.5 text-[11px] font-medium text-amber-700">changed</span>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <label htmlFor={id("vis")} className="sr-only">
                        Visibility of {row.label}
                      </label>
                      <select
                        id={id("vis")}
                        className={selectClass}
                        disabled={disabled}
                        value={s.shown ? "shown" : "hidden"}
                        onChange={(e) => set(row.key, { shown: e.target.value === "shown" })}
                      >
                        <option value="shown">Shown</option>
                        <option value="hidden">{isConsent ? "Hidden (Private only)" : "Hidden"}</option>
                      </select>
                      {isConsent && !s.shown && (
                        <p className="mt-1 max-w-48 text-[11px] text-amber-700">Feedback is saved as Private and can never be published.</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {isConsent ? (
                        <span className="text-xs text-slate-400">Always required</span>
                      ) : (
                        <>
                          <label htmlFor={id("req")} className="sr-only">
                            Requirement for {row.label}
                          </label>
                          <select
                            id={id("req")}
                            className={selectClass}
                            disabled={disabled || !s.shown}
                            value={s.required ? "required" : "optional"}
                            onChange={(e) => set(row.key, { required: e.target.value === "required" })}
                          >
                            <option value="required">Required</option>
                            <option value="optional">Optional</option>
                          </select>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {!canPrefill ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <label htmlFor={id("src")} className="sr-only">
                            Prefill source for {row.label}
                          </label>
                          <select
                            id={id("src")}
                            className={selectClass}
                            disabled={disabled}
                            value={s.prefill_source}
                            onChange={(e) => {
                              const source = e.target.value as PrefillSource;
                              const r = row as GridRow;
                              set(row.key, {
                                prefill_source: source,
                                prefill_field: source === "client" ? (s.prefill_field ?? r.maps_to_client_field) : source === "project" ? "name" : null,
                              });
                            }}
                          >
                            <option value="none">None</option>
                            <option value="client">From client record</option>
                            <option value="project" disabled={!hasProject}>
                              From project
                            </option>
                            <option value="custom">Custom value</option>
                          </select>
                          {(s.prefill_source === "client" || s.prefill_source === "project") && (
                            <>
                              <label htmlFor={id("field")} className="sr-only">
                                Property for {row.label}
                              </label>
                              <select
                                id={id("field")}
                                className={selectClass}
                                disabled={disabled}
                                value={s.prefill_field ?? ""}
                                onChange={(e) => set(row.key, { prefill_field: e.target.value || null })}
                              >
                                <option value="">Choose…</option>
                                {(s.prefill_source === "client" ? clientOptions : projectOptions).map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                          {s.prefill_source === "custom" && (
                            <>
                              <label htmlFor={id("val")} className="sr-only">
                                Prefill value for {row.label}
                              </label>
                              <input
                                id={id("val")}
                                className={cn(selectClass, "w-44")}
                                disabled={disabled}
                                value={s.prefill_value ?? ""}
                                maxLength={2000}
                                onChange={(e) => set(row.key, { prefill_value: e.target.value })}
                              />
                            </>
                          )}
                          {s.prefill_source !== "none" && (
                            <span className={cn("max-w-48 truncate text-[11px]", value ? "text-slate-500" : "text-amber-700")} title={value ?? undefined}>
                              {value ? `→ ${value}` : "No value available: field starts empty"}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {canPrefill && s.prefill_source !== "none" ? (
                        <label className="flex items-center gap-1.5 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            className="size-4"
                            disabled={disabled}
                            checked={s.prefill_locked}
                            onChange={(e) => set(row.key, { prefill_locked: e.target.checked })}
                          />
                          <Lock className="size-3" aria-hidden /> Locked
                        </label>
                      ) : (
                        <span className="text-xs text-slate-400">Editable</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ),
        )}
      </table>
    </div>
  );
}
