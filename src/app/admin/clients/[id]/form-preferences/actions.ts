"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { clientDefaultsFrom } from "@/lib/form-customize";
import { cleanOverrideMap } from "@/lib/form/settings";
import type { FormItemRow, TemplateSettings } from "@/lib/form/types";

export type PrefsResult = { ok: boolean; error?: string };

/** Save per-item defaults for this client, relative to the chosen template's defaults. */
export async function saveClientFormDefaultsAction(clientId: string, templateId: string, settings: unknown): Promise<PrefsResult> {
  const ctx = await assertWritable();
  const [{ data: client }, { data: template }, { data: items }] = await Promise.all([
    ctx.supabase.from("clients").select("id, form_defaults").eq("id", clientId).maybeSingle(),
    ctx.supabase.from("form_templates").select("id, settings").eq("id", templateId).maybeSingle(),
    ctx.supabase.from("form_items").select("*").eq("template_id", templateId).is("archived_at", null),
  ]);
  if (!client || !template) return { ok: false, error: "Client or template not found." };

  const next = clientDefaultsFrom(
    settings,
    (items ?? []) as FormItemRow[],
    template.settings as Partial<TemplateSettings>,
    cleanOverrideMap(client.form_defaults),
  );
  const { error } = await ctx.supabase.from("clients").update({ form_defaults: next }).eq("id", clientId);
  if (error) return { ok: false, error: error.message };

  await logActivity(ctx.supabase, {
    workspaceId: ctx.workspace.id,
    clientId,
    entityType: "client",
    entityId: clientId,
    action: "form_preferences_updated",
  });
  revalidatePath(`/admin/clients/${clientId}/form-preferences`);
  return { ok: true };
}
