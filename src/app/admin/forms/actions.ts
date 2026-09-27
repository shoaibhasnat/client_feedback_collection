"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { COPY_FIELDS, mappingAllows, typesFor } from "@/lib/form/catalog";
import { NO_PREFILL_TYPES } from "@/lib/form/settings";
import { CLIENT_FIELD_OPTIONS, PROJECT_FIELD_OPTIONS } from "@/lib/form/snapshot";
import type { ItemType } from "@/lib/form/types";
import { CHOICE_TYPES, CONSENT_LEVELS } from "@/lib/form/types";
import { VIDEO_STORAGE_MAX_MB } from "@/lib/video-limits";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string; field?: string };

// Template edits never affect requests already created: each request stores its own snapshot.

const TEMPLATE_COLUMNS = "id, name, is_default, settings, copy";
const ITEM_COPY_COLUMNS =
  "section, key, label, helper_text, placeholder, type, options, required, visibility, maps_to_client_field, default_shown, default_prefill, default_prefill_field, default_prefill_value, default_prefill_locked, sort_order";

function refresh(templateId?: string) {
  revalidatePath("/admin/forms");
  if (templateId) revalidatePath(`/admin/forms/${templateId}`);
}

// ---------- Templates ----------------------------------------------------

const nameSchema = z.string().trim().min(1, "Give the template a name.").max(80);

async function copyItems(
  ctx: Awaited<ReturnType<typeof assertWritable>>,
  fromTemplateId: string,
  toTemplateId: string,
  sections: string[],
) {
  const { data: items } = await ctx.supabase
    .from("form_items")
    .select(ITEM_COPY_COLUMNS)
    .eq("template_id", fromTemplateId)
    .is("archived_at", null)
    .in("section", sections);
  if (items?.length) {
    const { error } = await ctx.supabase
      .from("form_items")
      .insert(items.map((i) => ({ ...i, workspace_id: ctx.workspace.id, template_id: toTemplateId })));
    if (error) throw new Error(error.message);
  }
}

/** New template: About You / Contact fields, settings and copy come from the default template; no questions. */
export async function createTemplateAction(formData: FormData) {
  const ctx = await assertWritable();
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) redirect(`/admin/forms?error=${encodeURIComponent(name.error.issues[0].message)}`);

  const { data: base } = await ctx.supabase.from("form_templates").select(TEMPLATE_COLUMNS).eq("is_default", true).maybeSingle();
  const { data, error } = await ctx.supabase
    .from("form_templates")
    .insert({ workspace_id: ctx.workspace.id, name: name.data, settings: base?.settings ?? {}, copy: base?.copy ?? {} })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  if (base) await copyItems(ctx, base.id, data.id, ["about", "contact"]);
  refresh();
  redirect(`/admin/forms/${data.id}`);
}

export async function duplicateTemplateAction(templateId: string) {
  const ctx = await assertWritable();
  const { data: t } = await ctx.supabase.from("form_templates").select(TEMPLATE_COLUMNS).eq("id", templateId).single();
  if (!t) return;
  const { data, error } = await ctx.supabase
    .from("form_templates")
    .insert({ workspace_id: ctx.workspace.id, name: `${t.name} (copy)`.slice(0, 80), settings: t.settings, copy: t.copy })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await copyItems(ctx, t.id, data.id, ["question", "about", "contact"]);
  refresh();
  redirect(`/admin/forms/${data.id}`);
}

export async function renameTemplateAction(templateId: string, name: string): Promise<ActionResult> {
  const ctx = await assertWritable();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("form_templates").update({ name: parsed.data }).eq("id", templateId);
  if (error) return { ok: false, error: error.message };
  refresh(templateId);
  return { ok: true };
}

export async function setDefaultTemplateAction(templateId: string) {
  const ctx = await assertWritable();
  const { data: t } = await ctx.supabase.from("form_templates").select("id, archived_at").eq("id", templateId).single();
  if (!t || t.archived_at) return;
  // One default per workspace (partial unique index): clear the old one first.
  await ctx.supabase.from("form_templates").update({ is_default: false }).eq("is_default", true).neq("id", templateId);
  await ctx.supabase.from("form_templates").update({ is_default: true }).eq("id", templateId);
  refresh(templateId);
}

export async function archiveTemplateAction(templateId: string, archived: boolean) {
  const ctx = await assertWritable();
  if (archived) {
    const { data: t } = await ctx.supabase.from("form_templates").select("is_default").eq("id", templateId).single();
    if (t?.is_default) redirect(`/admin/forms/${templateId}?error=${encodeURIComponent("Choose another default template before archiving this one.")}`);
  }
  await ctx.supabase
    .from("form_templates")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", templateId);
  refresh(templateId);
  if (archived) redirect("/admin/forms");
}

// ---------- Template settings and copy ------------------------------------

const settingsSchema = z.object({
  rating_enabled: z.boolean(),
  rating_required: z.boolean(),
  video_enabled: z.boolean(),
  video_required: z.boolean(),
  video_max_seconds: z.number().int().min(15, "Allow at least 15 seconds.").max(300, "Videos can be at most 5 minutes."),
  video_max_mb: z.number().int().min(5).max(VIDEO_STORAGE_MAX_MB, `The storage limit is ${VIDEO_STORAGE_MAX_MB} MB per video.`),
  consent_options: z.array(z.enum(CONSENT_LEVELS as [string, ...string[]])).min(1, "Offer at least one consent option."),
  cta: z.object({
    type: z.enum(["none", "share", "link"]),
    label: z.string().trim().max(200),
    url: z.union([z.literal(""), z.string().trim().max(2000).regex(/^https?:\/\/\S+$/, "The CTA link must start with https://")]),
  }),
});

export async function saveTemplateSettingsAction(templateId: string, input: unknown): Promise<ActionResult> {
  const ctx = await assertWritable();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.cta.type === "link" && !parsed.data.cta.url) return { ok: false, error: "Add the link for the thank-you button." };

  const { data: t } = await ctx.supabase.from("form_templates").select("settings").eq("id", templateId).single();
  const settings = {
    ...((t?.settings ?? {}) as Record<string, unknown>),
    ...parsed.data,
    rating_required: parsed.data.rating_enabled && parsed.data.rating_required,
    video_required: parsed.data.video_enabled && parsed.data.video_required,
    // Keep consent options in a stable order.
    consent_options: CONSENT_LEVELS.filter((l) => parsed.data.consent_options.includes(l)),
  };
  const { error } = await ctx.supabase.from("form_templates").update({ settings }).eq("id", templateId);
  if (error) return { ok: false, error: error.message };
  refresh(templateId);
  return { ok: true };
}

export async function saveTemplateCopyAction(templateId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const ctx = await assertWritable();
  const copy: Record<string, string> = {};
  for (const f of COPY_FIELDS) {
    const v = input[f.key];
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length > 1000) return { ok: false, error: `“${f.label}” is too long (max 1,000 characters).` };
    if (trimmed) copy[f.key] = trimmed;
  }
  const { error } = await ctx.supabase.from("form_templates").update({ copy }).eq("id", templateId);
  if (error) return { ok: false, error: error.message };
  refresh(templateId);
  return { ok: true };
}

// ---------- Items -------------------------------------------------------

export type ItemInput = {
  id: string | null;
  section: "question" | "about" | "contact";
  label: string;
  helper_text: string;
  placeholder: string;
  type: ItemType;
  options: string[];
  required: boolean;
  visibility: "public-eligible" | "private-only";
  maps_to_client_field: string;
  default_shown: boolean;
  default_prefill: "none" | "client" | "project" | "custom";
  default_prefill_field: string;
  default_prefill_value: string;
  default_prefill_locked: boolean;
};

const itemSchema = z.object({
  id: z.uuid().nullable(),
  section: z.enum(["question", "about", "contact"]),
  label: z.string().trim().min(1, "Write the question or field label.").max(300),
  helper_text: z.string().trim().max(500),
  placeholder: z.string().trim().max(200),
  type: z.string(),
  options: z.array(z.string().trim().min(1).max(100)).max(30),
  required: z.boolean(),
  visibility: z.enum(["public-eligible", "private-only"]),
  maps_to_client_field: z.string().max(80),
  default_shown: z.boolean(),
  default_prefill: z.enum(["none", "client", "project", "custom"]),
  default_prefill_field: z.string().max(80),
  default_prefill_value: z.string().max(2000),
  default_prefill_locked: z.boolean(),
});

function keyFromLabel(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .slice(0, 5)
    .join("_")
    .slice(0, 40);
  return /^[a-z]/.test(base) ? base : `q_${base || "item"}`;
}

export async function saveItemAction(templateId: string, input: ItemInput): Promise<ActionResult> {
  const ctx = await assertWritable();
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0]) };
  }
  const d = parsed.data;
  const type = d.type as ItemType;
  if (!typesFor(d.section).includes(type)) return { ok: false, error: "That type isn't available in this section.", field: "type" };

  const options = [...new Set(d.options)];
  if (CHOICE_TYPES.includes(type) && options.length < 2) {
    return { ok: false, error: "Add at least two options.", field: "options" };
  }

  // Mapping to the client record (About You / Contact only).
  let mapsTo: string | null = null;
  if (d.section !== "question" && d.maps_to_client_field) {
    const custom = d.maps_to_client_field.startsWith("custom:");
    if (custom) {
      const { data: def } = await ctx.supabase
        .from("settings_custom_fields")
        .select("key")
        .eq("entity", "client")
        .eq("key", d.maps_to_client_field.slice(7))
        .maybeSingle();
      if (!def) return { ok: false, error: "That custom client field no longer exists.", field: "maps_to_client_field" };
    } else if (!(CLIENT_FIELD_OPTIONS as readonly string[]).includes(d.maps_to_client_field)) {
      return { ok: false, error: "Unknown client field.", field: "maps_to_client_field" };
    }
    if (!mappingAllows(d.maps_to_client_field, type)) {
      return { ok: false, error: "This field type can't update that client property.", field: "maps_to_client_field" };
    }
    mapsTo = d.maps_to_client_field;
  }
  if (type === "image" && !mapsTo) {
    return { ok: false, error: "Image uploads must fill the client's photo or logo.", field: "maps_to_client_field" };
  }

  // Default prefill.
  let prefill = d.default_prefill;
  let prefillField: string | null = null;
  let prefillValue: string | null = null;
  if (NO_PREFILL_TYPES.includes(type)) prefill = "none";
  if (prefill === "client") {
    prefillField = d.default_prefill_field || mapsTo;
    if (!prefillField) return { ok: false, error: "Choose which client property to prefill from.", field: "default_prefill_field" };
    if (!prefillField.startsWith("custom:") && !(CLIENT_FIELD_OPTIONS as readonly string[]).includes(prefillField)) {
      return { ok: false, error: "Unknown client property.", field: "default_prefill_field" };
    }
  } else if (prefill === "project") {
    prefillField = d.default_prefill_field;
    if (!prefillField.startsWith("custom:") && !(PROJECT_FIELD_OPTIONS as readonly string[]).includes(prefillField)) {
      return { ok: false, error: "Choose which project property to prefill from.", field: "default_prefill_field" };
    }
  } else if (prefill === "custom") {
    prefillValue = d.default_prefill_value || null;
    if (!prefillValue) return { ok: false, error: "Enter the value to prefill.", field: "default_prefill_value" };
    if ((type === "single_choice" || type === "dropdown") && !options.includes(prefillValue)) {
      return { ok: false, error: "The prefilled value must be one of the options.", field: "default_prefill_value" };
    }
    if (type === "yes_no" && !["yes", "no"].includes(prefillValue)) {
      return { ok: false, error: "Prefill Yes/No with “yes” or “no”.", field: "default_prefill_value" };
    }
  }
  if (prefillField && !/^(custom:)?[a-z][a-z0-9_]{0,62}$/.test(prefillField)) {
    return { ok: false, error: "Invalid prefill property.", field: "default_prefill_field" };
  }

  const row = {
    label: d.label,
    helper_text: d.helper_text || null,
    placeholder: d.placeholder || null,
    type,
    options: CHOICE_TYPES.includes(type) ? options : [],
    required: d.required,
    visibility: d.section === "contact" ? "private-only" : d.visibility,
    maps_to_client_field: mapsTo,
    default_shown: d.default_shown,
    default_prefill: prefill,
    default_prefill_field: prefillField,
    default_prefill_value: prefillValue,
    default_prefill_locked: prefill !== "none" && d.default_prefill_locked,
  };

  if (d.id) {
    // The key is permanent: stored answers are keyed by it.
    const { error } = await ctx.supabase.from("form_items").update(row).eq("id", d.id).eq("template_id", templateId);
    if (error) return { ok: false, error: error.message };
    refresh(templateId);
    return { ok: true, id: d.id };
  }

  const { data: existing } = await ctx.supabase.from("form_items").select("key, sort_order, section").eq("template_id", templateId);
  const keys = new Set((existing ?? []).map((e) => e.key));
  const base = keyFromLabel(d.label);
  let key = base;
  for (let i = 2; keys.has(key); i += 1) key = `${base}_${i}`.slice(0, 63);
  const maxOrder = Math.max(0, ...(existing ?? []).filter((e) => e.section === d.section).map((e) => e.sort_order));

  const { data, error } = await ctx.supabase
    .from("form_items")
    .insert({ ...row, workspace_id: ctx.workspace.id, template_id: templateId, section: d.section, key, sort_order: maxOrder + 10 })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  refresh(templateId);
  return { ok: true, id: data.id };
}

export async function reorderItemsAction(templateId: string, orderedIds: string[]): Promise<ActionResult> {
  const ctx = await assertWritable();
  const ids = z.array(z.uuid()).max(200).safeParse(orderedIds);
  if (!ids.success) return { ok: false, error: "Invalid order." };
  const results = await Promise.all(
    ids.data.map((id, index) =>
      ctx.supabase.from("form_items").update({ sort_order: (index + 1) * 10 }).eq("id", id).eq("template_id", templateId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };
  refresh(templateId);
  return { ok: true };
}

export async function setItemFlagAction(
  templateId: string,
  itemId: string,
  flag: "required" | "default_shown",
  value: boolean,
): Promise<ActionResult> {
  const ctx = await assertWritable();
  if (!["required", "default_shown"].includes(flag)) return { ok: false, error: "Invalid setting." };
  const { error } = await ctx.supabase.from("form_items").update({ [flag]: value }).eq("id", itemId).eq("template_id", templateId);
  if (error) return { ok: false, error: error.message };
  refresh(templateId);
  return { ok: true };
}

/** Archived items disappear from new requests but stay available to old snapshots and submissions. */
export async function archiveItemAction(templateId: string, itemId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await assertWritable();
  const { error } = await ctx.supabase
    .from("form_items")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", itemId)
    .eq("template_id", templateId);
  if (error) return { ok: false, error: error.message };
  refresh(templateId);
  return { ok: true };
}
