import type {
  FormItemRow,
  ItemSettings,
  OverrideMap,
  SnapshotItem,
  TemplateCopy,
  TemplateSettings,
  TemplateSnapshot,
} from "@/lib/form/types";
import { CONSENT_KEY, RATING_KEY, VIDEO_KEY } from "@/lib/form/types";
import { baselineSettings, cleanOverrideMap, NO_PREFILL_TYPES, resolveSettings } from "@/lib/form/settings";
import { firstName } from "@/lib/utils";
import { VIDEO_STORAGE_MAX_MB } from "@/lib/video-limits";

export type ClientRecord = Record<string, unknown> & {
  name: string;
  company: string | null;
  emails: string[] | null;
};

export type ProjectRecord = Record<string, unknown> & { name: string };

/** Client properties an About You / Contact field can map to (plus `custom:<key>`). */
export const CLIENT_FIELD_OPTIONS = [
  "name",
  "job_title",
  "company",
  "website",
  "linkedin_url",
  "photo_url",
  "logo_url",
  "email",
  "phone",
  "whatsapp",
  "preferred_contact",
  "country",
  "city",
  "timezone",
] as const;

/** Project properties a "From project" prefill can read (plus `custom:<key>`). */
export const PROJECT_FIELD_OPTIONS = [
  "name",
  "description",
  "service_type",
  "platform",
  "start_date",
  "end_date",
  "outcomes",
] as const;

function asText(v: unknown): string | null {
  if (typeof v === "string") return v.trim() === "" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function readCustom(record: Record<string, unknown>, field: string): string | null {
  const custom = record.custom_fields;
  if (!custom || typeof custom !== "object") return null;
  return asText((custom as Record<string, unknown>)[field.slice("custom:".length)]);
}

export function readClientField(client: ClientRecord, field: string | null): string | null {
  if (!field) return null;
  if (field.startsWith("custom:")) return readCustom(client, field);
  if (field === "email") return client.emails?.[0] ?? null;
  return asText(client[field]);
}

export function readProjectField(project: ProjectRecord | null, field: string | null): string | null {
  if (!project || !field) return null;
  if (field.startsWith("custom:")) return readCustom(project, field);
  return asText(project[field]);
}

const DEFAULT_SETTINGS: TemplateSettings = {
  rating_enabled: true,
  rating_required: false,
  video_enabled: false,
  video_required: false,
  video_max_seconds: 90,
  video_max_mb: VIDEO_STORAGE_MAX_MB,
  consent_options: ["full", "partial", "anonymous", "private"],
  cta: { type: "none", label: "", url: "" },
};

/** Work out the prefill value one item will carry, or null (with the reason when it's a gap). */
export function resolvePrefill(
  row: Pick<FormItemRow, "type" | "options" | "maps_to_client_field">,
  s: ItemSettings,
  client: ClientRecord,
  project: ProjectRecord | null,
): string | null {
  if (NO_PREFILL_TYPES.includes(row.type)) return null;
  let value: string | null = null;
  if (s.prefill_source === "client") value = readClientField(client, s.prefill_field ?? row.maps_to_client_field);
  else if (s.prefill_source === "project") value = readProjectField(project, s.prefill_field);
  else if (s.prefill_source === "custom") value = asText(s.prefill_value);
  if (value === null) return null;
  // A prefilled choice must be one of the options, or a locked value could never validate.
  if (row.type === "yes_no" && value !== "yes" && value !== "no") return null;
  if ((row.type === "single_choice" || row.type === "dropdown") && row.options.length && !row.options.includes(value)) {
    return null;
  }
  return value.slice(0, 5000);
}

/**
 * Freeze the template into a self-contained snapshot for one request, resolving every item's
 * visibility, requirement, prefill and lock. Later template or client-default edits never touch it
 * (brief §3.2). Precedence: request override → client default → template default (brief §3.7).
 */
export function buildSnapshot(args: {
  template: { id: string; name: string; settings: Partial<TemplateSettings>; copy: TemplateCopy };
  items: FormItemRow[];
  client: ClientRecord;
  project: ProjectRecord | null;
  owner: { name: string; photo_url: string | null; tagline: string; share_url: string };
  overrides?: OverrideMap;
}): { snapshot: TemplateSnapshot; warnings: string[]; resolved: Record<string, ItemSettings> } {
  const warnings: string[] = [];
  const order = { question: 0, about: 1, contact: 2 } as const;
  const active = args.items
    .filter((i) => !i.archived_at)
    .sort((a, b) => order[a.section] - order[b.section] || a.sort_order - b.sort_order);

  const clientDefaults = cleanOverrideMap(args.client.form_defaults);
  const overrides = cleanOverrideMap(args.overrides);
  const baseline = baselineSettings(active, args.template.settings, clientDefaults);
  const resolved: Record<string, ItemSettings> = {};
  for (const [key, base] of Object.entries(baseline)) resolved[key] = resolveSettings(base, overrides[key]);

  const items: SnapshotItem[] = active.map((row) => {
    const s = resolved[row.key];
    const prefill = resolvePrefill(row, s, args.client, args.project);
    if (s.prefill_source !== "none" && prefill === null && row.type !== "image") {
      warnings.push(`“${row.label}” has no value to prefill, so the client will see an empty field.`);
    }
    return {
      key: row.key,
      section: row.section,
      label: row.label,
      helper_text: row.helper_text,
      placeholder: row.placeholder,
      type: row.type,
      options: Array.isArray(row.options) ? row.options : [],
      required: s.shown && s.required,
      visibility: row.section === "contact" ? "private-only" : row.visibility,
      maps_to_client_field: row.maps_to_client_field,
      shown: s.shown,
      prefill_value: prefill,
      prefill_locked: s.prefill_locked && prefill !== null,
    };
  });

  const rating = resolved[RATING_KEY];
  const consent = resolved[CONSENT_KEY];
  const video = resolved[VIDEO_KEY];

  return {
    snapshot: {
      version: 2,
      template: { id: args.template.id, name: args.template.name },
      settings: {
        ...DEFAULT_SETTINGS,
        ...args.template.settings,
        rating_enabled: rating.shown,
        rating_required: rating.shown && rating.required,
        video_enabled: video.shown,
        video_required: video.shown && video.required,
        video_max_seconds: Math.min(Math.max(Number(args.template.settings.video_max_seconds) || 90, 15), 300),
        video_max_mb: Math.min(Math.max(Number(args.template.settings.video_max_mb) || VIDEO_STORAGE_MAX_MB, 5), VIDEO_STORAGE_MAX_MB),
        // Hiding the consent step is only allowed as "Private" (brief §3.7).
        consent_forced: consent.shown ? null : "private",
      },
      copy: args.template.copy,
      items,
      context: {
        client_first_name: firstName(args.client.name),
        client_name: args.client.name,
        project_name: args.project?.name ?? "our project",
        company: args.client.company ?? "",
      },
      owner: args.owner,
      created_at: new Date().toISOString(),
    },
    warnings,
    resolved,
  };
}
