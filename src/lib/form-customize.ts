import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFormBranding } from "@/lib/public-form";
import { baselineSettings, cleanOverride, diffSettings, resolveSettings } from "@/lib/form/settings";
import { buildSteps, estimateMinutes, renderText } from "@/lib/form/steps";
import type { FormItemRow, ItemSettings, OverrideMap, TemplateSettings, TemplateSnapshot } from "@/lib/form/types";

/** Owner-supplied full settings → only the parts that differ from `base` (request overrides / client defaults). */
export function overridesFrom(raw: unknown, base: Record<string, ItemSettings>): OverrideMap {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: OverrideMap = {};
  for (const [key, b] of Object.entries(base)) {
    const full = resolveSettings(b, cleanOverride(input[key]));
    const diff = diffSettings(b, full);
    if (Object.keys(diff).length) out[key] = diff;
  }
  return out;
}

/** Client defaults are stored relative to the template's own defaults, keyed by item key. */
export function clientDefaultsFrom(
  raw: unknown,
  rows: FormItemRow[],
  templateSettings: Partial<TemplateSettings>,
  existing: OverrideMap,
): OverrideMap {
  const templateOnly = baselineSettings(rows, templateSettings, {});
  const next: OverrideMap = { ...existing };
  const changes = overridesFrom(raw, templateOnly);
  for (const key of Object.keys(templateOnly)) {
    if (changes[key]) next[key] = changes[key];
    else delete next[key];
  }
  return next;
}

export async function prefillChoices(supabase: SupabaseClient) {
  const { data } = await supabase.from("settings_custom_fields").select("entity, key, label").order("label");
  return {
    clientCustom: (data ?? []).filter((f) => f.entity === "client").map((f) => ({ key: f.key, label: f.label })),
    projectCustom: (data ?? []).filter((f) => f.entity === "project").map((f) => ({ key: f.key, label: f.label })),
  };
}

export function describeScreens(snapshot: TemplateSnapshot): string[] {
  return [
    ...buildSteps(snapshot).map((s) => {
      switch (s.kind) {
        case "welcome":
          return "Welcome";
        case "rating":
          return snapshot.settings.rating_required ? "Star rating (required)" : "Star rating";
        case "question":
          return `Question ${s.index + 1}: ${renderText(snapshot, s.item.label)}`;
        case "about":
          return `About you (${s.items.length} fields)`;
        case "contact":
          return `Contact details (${s.items.length} fields, private)`;
        case "video":
          return `Video (${snapshot.settings.video_required ? "required" : "optional"}, up to ${snapshot.settings.video_max_seconds}s)`;
        case "consent":
          return "Consent";
      }
    }),
    "Thank you",
  ];
}

export async function previewExtras(workspaceId: string, snapshot: TemplateSnapshot) {
  const branding = await loadFormBranding(workspaceId, snapshot.owner.photo_url);
  return {
    snapshot: { ...snapshot, owner: { ...snapshot.owner, name: branding.ownerName ?? snapshot.owner.name } },
    theme: branding.theme,
    ownerPhotoUrl: branding.ownerPhotoUrl,
    shareUrl: branding.shareUrl,
    minutes: estimateMinutes(snapshot),
    screens: describeScreens(snapshot),
  };
}
