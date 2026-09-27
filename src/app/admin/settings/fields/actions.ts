"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";

export type FieldResult = { ok: boolean; error?: string };

const labelSchema = z.string().trim().min(1, "Give the field a label.").max(80);
const optionsSchema = z.array(z.string().trim().min(1).max(100)).max(50);

function keyFromLabel(label: string) {
  const base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(base) ? base : `f_${base || "field"}`;
}

function refresh() {
  revalidatePath("/admin/settings/fields");
  revalidatePath("/admin/clients", "layout");
  revalidatePath("/admin/projects", "layout");
  revalidatePath("/admin/forms", "layout");
}

export async function createCustomFieldAction(input: { entity: string; label: string; type: string; options: string[] }): Promise<FieldResult> {
  const ctx = await assertWritable();
  const parsed = z
    .object({
      entity: z.enum(["client", "project"]),
      label: labelSchema,
      type: z.enum(["text", "number", "date", "dropdown", "url"]),
      options: optionsSchema,
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const options = [...new Set(parsed.data.options)];
  if (parsed.data.type === "dropdown" && options.length < 2) return { ok: false, error: "A dropdown needs at least two options." };

  const { data: existing } = await ctx.supabase.from("settings_custom_fields").select("key").eq("entity", parsed.data.entity);
  const keys = new Set((existing ?? []).map((e) => e.key));
  const base = keyFromLabel(parsed.data.label);
  let key = base;
  for (let i = 2; keys.has(key); i += 1) key = `${base}_${i}`;

  const { error } = await ctx.supabase.from("settings_custom_fields").insert({
    workspace_id: ctx.workspace.id,
    entity: parsed.data.entity,
    key,
    label: parsed.data.label,
    type: parsed.data.type,
    options: parsed.data.type === "dropdown" ? options : [],
  });
  if (error) return { ok: false, error: error.code === "23505" ? "A field with that key already exists." : error.message };
  refresh();
  return { ok: true };
}

/** Label and dropdown options can change; key and type are fixed because stored values depend on them. */
export async function updateCustomFieldAction(id: string, input: { label: string; options: string[] }): Promise<FieldResult> {
  const ctx = await assertWritable();
  const label = labelSchema.safeParse(input.label);
  const options = optionsSchema.safeParse(input.options);
  if (!label.success) return { ok: false, error: label.error.issues[0].message };
  if (!options.success) return { ok: false, error: "Options must be 1–100 characters each." };

  const { data: def } = await ctx.supabase.from("settings_custom_fields").select("type").eq("id", id).maybeSingle();
  if (!def) return { ok: false, error: "Field not found." };
  const opts = [...new Set(options.data)];
  if (def.type === "dropdown" && opts.length < 2) return { ok: false, error: "A dropdown needs at least two options." };

  const { error } = await ctx.supabase
    .from("settings_custom_fields")
    .update({ label: label.data, options: def.type === "dropdown" ? opts : [] })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

/** Removes the definition only; values already stored on clients/projects are kept. */
export async function deleteCustomFieldAction(id: string): Promise<FieldResult> {
  const ctx = await assertWritable();
  const { data: def } = await ctx.supabase.from("settings_custom_fields").select("entity, key").eq("id", id).maybeSingle();
  if (!def) return { ok: false, error: "Field not found." };
  if (def.entity === "client") {
    const { count } = await ctx.supabase
      .from("form_items")
      .select("id", { count: "exact", head: true })
      .eq("maps_to_client_field", `custom:${def.key}`)
      .is("archived_at", null);
    if (count) return { ok: false, error: "A form field still fills this custom field. Change or archive it in Forms first." };
  }
  const { error } = await ctx.supabase.from("settings_custom_fields").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
