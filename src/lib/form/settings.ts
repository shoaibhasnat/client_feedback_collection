import type {
  FormItemRow,
  FormPreset,
  ItemOverride,
  ItemSettings,
  ItemType,
  OverrideMap,
  PrefillSource,
  TemplateSettings,
} from "@/lib/form/types";
import { CONSENT_KEY, RATING_KEY, VIDEO_KEY } from "@/lib/form/types";

// Per-item settings (brief §3.7). Shared by the dashboard (browser) and the server.
// Precedence: request override → client default → template default.

const PREFILL_SOURCES: PrefillSource[] = ["none", "client", "project", "custom"];

/** Types whose value can't be expressed as a prefilled string. */
export const NO_PREFILL_TYPES: ItemType[] = ["rating_5", "rating_10", "multiple_choice"];

export function templateDefaults(row: FormItemRow): ItemSettings {
  return {
    shown: row.default_shown,
    required: row.required,
    prefill_source: row.default_prefill,
    prefill_field: row.default_prefill_field ?? (row.default_prefill === "client" ? row.maps_to_client_field : null),
    prefill_value: row.default_prefill_value,
    prefill_locked: row.default_prefill_locked,
  };
}

export function ratingDefaults(settings: Partial<TemplateSettings>): ItemSettings {
  return {
    shown: settings.rating_enabled ?? true,
    required: settings.rating_required ?? false,
    prefill_source: "none",
    prefill_field: null,
    prefill_value: null,
    prefill_locked: false,
  };
}

export function videoDefaults(settings: Partial<TemplateSettings>): ItemSettings {
  return {
    shown: settings.video_enabled ?? false,
    required: settings.video_required ?? false,
    prefill_source: "none",
    prefill_field: null,
    prefill_value: null,
    prefill_locked: false,
  };
}

export const CONSENT_DEFAULTS: ItemSettings = {
  shown: true,
  required: true,
  prefill_source: "none",
  prefill_field: null,
  prefill_value: null,
  prefill_locked: false,
};

/** Keep only well-formed keys from untrusted override input (form posts, stored JSON). */
export function cleanOverride(raw: unknown): ItemOverride {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: ItemOverride = {};
  if (typeof r.shown === "boolean") out.shown = r.shown;
  if (typeof r.required === "boolean") out.required = r.required;
  if (typeof r.prefill_source === "string" && PREFILL_SOURCES.includes(r.prefill_source as PrefillSource)) {
    out.prefill_source = r.prefill_source as PrefillSource;
  }
  if (r.prefill_field === null || (typeof r.prefill_field === "string" && /^(custom:)?[a-z][a-z0-9_]{0,62}$/.test(r.prefill_field))) {
    out.prefill_field = r.prefill_field as string | null;
  }
  if (r.prefill_value === null || typeof r.prefill_value === "string") {
    out.prefill_value = r.prefill_value === null ? null : (r.prefill_value as string).slice(0, 2000);
  }
  if (typeof r.prefill_locked === "boolean") out.prefill_locked = r.prefill_locked;
  return out;
}

export function cleanOverrideMap(raw: unknown): OverrideMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OverrideMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^(__rating|__consent|__video|[a-z][a-z0-9_]{0,62})$/.test(key)) continue;
    const clean = cleanOverride(value);
    if (Object.keys(clean).length) out[key] = clean;
  }
  return out;
}

export function resolveSettings(base: ItemSettings, ...layers: (ItemOverride | undefined)[]): ItemSettings {
  const out = { ...base };
  for (const layer of layers) if (layer) Object.assign(out, layer);
  // A hidden item can't block the client; a none-prefill can't be locked.
  if (!out.shown) out.required = false;
  if (out.prefill_source === "none") out.prefill_locked = false;
  return out;
}

/** The subset of `full` that differs from `base` (what gets stored as an override). */
export function diffSettings(base: ItemSettings, full: ItemSettings): ItemOverride {
  const out: ItemOverride = {};
  for (const k of Object.keys(full) as (keyof ItemSettings)[]) {
    if (full[k] !== base[k]) (out as Record<string, unknown>)[k] = full[k];
  }
  return out;
}

/** Baseline settings for every item: template defaults with the client's saved defaults applied. */
export function baselineSettings(
  rows: FormItemRow[],
  templateSettings: Partial<TemplateSettings>,
  clientDefaults: OverrideMap,
): Record<string, ItemSettings> {
  const out: Record<string, ItemSettings> = {};
  for (const row of rows) out[row.key] = resolveSettings(templateDefaults(row), clientDefaults[row.key]);
  out[RATING_KEY] = resolveSettings(ratingDefaults(templateSettings), clientDefaults[RATING_KEY]);
  out[CONSENT_KEY] = resolveSettings(CONSENT_DEFAULTS, clientDefaults[CONSENT_KEY]);
  out[VIDEO_KEY] = resolveSettings(videoDefaults(templateSettings), clientDefaults[VIDEO_KEY]);
  return out;
}

/** Apply a quick preset on top of a baseline. Only visibility changes; prefills are kept. */
export function applyPreset(
  preset: FormPreset,
  rows: FormItemRow[],
  baseline: Record<string, ItemSettings>,
): Record<string, ItemSettings> {
  const out: Record<string, ItemSettings> = {};
  for (const [k, v] of Object.entries(baseline)) out[k] = { ...v };

  if (preset.rating !== "default" && out[RATING_KEY]) {
    out[RATING_KEY] = resolveSettings(out[RATING_KEY], { shown: preset.rating === "shown" });
  }
  const questions = rows.filter((r) => r.section === "question").sort((a, b) => a.sort_order - b.sort_order);
  questions.forEach((q, index) => {
    const shown = preset.questions_limit === null ? true : index < preset.questions_limit;
    out[q.key] = resolveSettings(out[q.key], { shown });
  });
  for (const row of rows) {
    if (row.section !== "question") {
      const hide = preset.sections_hidden.includes(row.section);
      out[row.key] = resolveSettings(out[row.key], { shown: hide ? false : baseline[row.key].shown });
    }
  }
  return out;
}

export function cleanPresets(raw: unknown): FormPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p, i): FormPreset => ({
      id: typeof p.id === "string" ? p.id.slice(0, 40) : `preset_${i}`,
      name: typeof p.name === "string" ? p.name.slice(0, 80) : `Preset ${i + 1}`,
      rating: p.rating === "shown" || p.rating === "hidden" ? p.rating : "default",
      questions_limit:
        typeof p.questions_limit === "number" && p.questions_limit >= 0 ? Math.min(50, Math.floor(p.questions_limit)) : null,
      sections_hidden: Array.isArray(p.sections_hidden)
        ? (p.sections_hidden.filter((s) => s === "about" || s === "contact") as ("about" | "contact")[])
        : [],
    }))
    .slice(0, 10);
}
