import type { FormItemRow, SnapshotItem, TemplateCopy, TemplateSettings, TemplateSnapshot } from "@/lib/form/types";
import { firstName } from "@/lib/utils";

export type ClientRecord = Record<string, unknown> & {
  name: string;
  company: string | null;
  emails: string[] | null;
};

export type ProjectRecord = Record<string, unknown> & { name: string };

/** Client properties an About You / Contact field can map to. */
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

export function readClientField(client: ClientRecord, field: string | null): string | null {
  if (!field) return null;
  if (field === "email") return client.emails?.[0] ?? null;
  const v = client[field];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function readProjectField(project: ProjectRecord | null, field: string | null): string | null {
  if (!project || !field) return null;
  const v = project[field];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

const DEFAULT_SETTINGS: TemplateSettings = {
  rating_enabled: true,
  video_enabled: false,
  video_max_seconds: 90,
  consent_options: ["full", "partial", "anonymous", "private"],
  cta: { type: "none", label: "", url: "" },
};

/**
 * Freeze the template into a self-contained snapshot for one request, resolving each
 * item's visibility, requirement and prefill. Later template edits never touch it (brief 3.2).
 * Precedence for per-item settings: request override → client default → template default.
 * Phase 1 exposes template defaults only; overrides plug in through `overrides`.
 */
export function buildSnapshot(args: {
  template: { id: string; name: string; settings: Partial<TemplateSettings>; copy: TemplateCopy };
  items: FormItemRow[];
  client: ClientRecord;
  project: ProjectRecord | null;
  owner: { name: string; photo_url: string | null; tagline: string; share_url: string };
  overrides?: Record<string, Partial<Pick<SnapshotItem, "shown" | "required" | "prefill_locked">> & { prefill?: string }>;
}): { snapshot: TemplateSnapshot; warnings: string[] } {
  const warnings: string[] = [];
  const active = args.items
    .filter((i) => !i.archived_at)
    .sort((a, b) => a.section.localeCompare(b.section) || a.sort_order - b.sort_order);

  const items: SnapshotItem[] = active.map((row) => {
    const o = { ...(args.client.form_defaults as Record<string, object> | undefined)?.[row.key], ...args.overrides?.[row.key] } as
      Partial<Pick<SnapshotItem, "shown" | "required" | "prefill_locked">> & { prefill?: string };

    let prefill: string | null = null;
    const source = row.default_prefill;
    if (o.prefill !== undefined) prefill = o.prefill || null;
    else if (source === "client") prefill = readClientField(args.client, row.maps_to_client_field);
    else if (source === "project") prefill = readProjectField(args.project, row.maps_to_client_field);
    else if (source === "custom") prefill = row.default_prefill_value;

    if (source !== "none" && prefill === null && row.type !== "image") {
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
      required: o.required ?? row.required,
      visibility: row.section === "contact" ? "private-only" : row.visibility,
      maps_to_client_field: row.maps_to_client_field,
      shown: o.shown ?? row.default_shown,
      prefill_value: prefill,
      prefill_locked: (o.prefill_locked ?? row.default_prefill_locked) && prefill !== null,
    };
  });

  const order = { question: 0, about: 1, contact: 2 } as const;
  items.sort((a, b) => order[a.section] - order[b.section]);

  return {
    snapshot: {
      version: 1,
      template: { id: args.template.id, name: args.template.name },
      settings: { ...DEFAULT_SETTINGS, ...args.template.settings, video_enabled: false },
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
  };
}
