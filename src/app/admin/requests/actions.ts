"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { insertRequest, prepareSnapshot } from "@/lib/requests";
import { clientDefaultsFrom, overridesFrom, prefillChoices, previewExtras } from "@/lib/form-customize";
import { baselineSettings, cleanPresets } from "@/lib/form/settings";
import type { FormItemRow, FormPreset, ItemSettings } from "@/lib/form/types";
import { nullIfEmpty } from "@/lib/utils";

export type CreateRequestState = { error?: string };

const createSchema = z.object({
  client_id: z.uuid("Choose a client."),
  project_id: z.uuid().nullable(),
  template_id: z.uuid().nullable(),
  personal_message: z.string().max(1000).nullable(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

function parseSettings(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value) return {};
  if (value.length > 200_000) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export async function createRequestAction(_prev: CreateRequestState, formData: FormData): Promise<CreateRequestState> {
  const ctx = await assertWritable();
  const parsed = createSchema.safeParse({
    client_id: String(formData.get("client_id") ?? ""),
    project_id: nullIfEmpty(formData.get("project_id")),
    template_id: nullIfEmpty(formData.get("template_id")),
    personal_message: nullIfEmpty(formData.get("personal_message")),
    expires_at: nullIfEmpty(formData.get("expires_at")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (parsed.data.expires_at && parsed.data.expires_at <= new Date().toISOString().slice(0, 10)) {
    return { error: "The expiry date must be in the future." };
  }

  const settings = parseSettings(formData.get("settings"));
  const saveAsClientDefaults = formData.get("save_client_defaults") === "on";
  const args = {
    workspaceId: ctx.workspace.id,
    clientId: parsed.data.client_id,
    projectId: parsed.data.project_id,
    templateId: parsed.data.template_id,
  };

  let id: string;
  try {
    // Baseline = template defaults + this client's saved defaults; store only what the owner changed.
    const base = await prepareSnapshot(ctx.supabase, args);
    const baseline = baselineSettings(base.rows, base.templateSettings, base.clientDefaults);
    const overrides = overridesFrom(settings, baseline);

    if (saveAsClientDefaults) {
      const nextDefaults = clientDefaultsFrom(settings, base.rows, base.templateSettings, base.clientDefaults);
      await ctx.supabase.from("clients").update({ form_defaults: nextDefaults }).eq("id", parsed.data.client_id);
    }

    ({ id } = await insertRequest(ctx.supabase, {
      ...args,
      personalMessage: parsed.data.personal_message,
      // End of the chosen day, UTC.
      expiresAt: parsed.data.expires_at ? `${parsed.data.expires_at}T23:59:59Z` : null,
      // Client defaults may just have changed, so resolve overrides against the fresh client record.
      overrides: saveAsClientDefaults ? {} : overrides,
    }));
  } catch (e) {
    return { error: (e as Error).message };
  }

  await logActivity(ctx.supabase, {
    workspaceId: ctx.workspace.id,
    clientId: parsed.data.client_id,
    entityType: "request",
    entityId: id,
    action: "created",
    meta: saveAsClientDefaults ? { saved_client_defaults: true } : {},
  });
  revalidatePath("/admin/requests");
  redirect(`/admin/requests/${id}?created=1`);
}

export type CustomizeData = {
  error?: string;
  rows?: Pick<FormItemRow, "key" | "label" | "section" | "type" | "options" | "maps_to_client_field">[];
  baseline?: Record<string, ItemSettings>;
  resolved?: Record<string, ItemSettings>;
  prefillValues?: Record<string, string | null>;
  presets?: FormPreset[];
  warnings?: string[];
  choices?: { clientCustom: { key: string; label: string }[]; projectCustom: { key: string; label: string }[] };
  preview?: Awaited<ReturnType<typeof previewExtras>>;
};

/**
 * Everything the "Customize form" step needs, plus a preview built from the exact snapshot the
 * request would store. `settings` (optional) are the owner's current per-item choices.
 */
export async function previewRequestAction(input: {
  clientId: string;
  projectId: string | null;
  templateId: string | null;
  settings?: unknown;
  personalMessage?: string | null;
}): Promise<CustomizeData> {
  const ctx = await assertWritable();
  try {
    const args = {
      workspaceId: ctx.workspace.id,
      clientId: input.clientId,
      projectId: input.projectId,
      templateId: input.templateId,
    };
    const base = await prepareSnapshot(ctx.supabase, args);
    const baseline = baselineSettings(base.rows, base.templateSettings, base.clientDefaults);
    const overrides = input.settings === undefined ? {} : overridesFrom(input.settings, baseline);
    const built = Object.keys(overrides).length ? await prepareSnapshot(ctx.supabase, { ...args, overrides }) : base;

    const [{ data: site }, choices, preview] = await Promise.all([
      ctx.supabase.from("site_settings").select("form_presets").eq("workspace_id", ctx.workspace.id).single(),
      prefillChoices(ctx.supabase),
      previewExtras(ctx.workspace.id, built.snapshot),
    ]);

    return {
      rows: base.rows
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((r) => ({ key: r.key, label: r.label, section: r.section, type: r.type, options: r.options, maps_to_client_field: r.maps_to_client_field })),
      baseline,
      resolved: built.resolved,
      prefillValues: Object.fromEntries(built.snapshot.items.map((i) => [i.key, i.prefill_value])),
      presets: cleanPresets(site?.form_presets),
      warnings: built.warnings,
      choices,
      preview,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function setRequest(requestId: string, patch: Record<string, unknown>, action: string) {
  const ctx = await assertWritable();
  const { data } = await ctx.supabase.from("requests").update(patch).eq("id", requestId).select("client_id").single();
  if (data) {
    await logActivity(ctx.supabase, {
      workspaceId: ctx.workspace.id,
      clientId: data.client_id,
      entityType: "request",
      entityId: requestId,
      action,
    });
  }
  revalidatePath(`/admin/requests/${requestId}`);
  revalidatePath("/admin/requests");
}

/** Called when the owner copies the link or a message: a draft becomes "sent". */
export async function markSentAction(requestId: string) {
  const ctx = await assertWritable();
  const { data } = await ctx.supabase
    .from("requests")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "draft")
    .select("client_id")
    .maybeSingle();
  if (data) {
    await logActivity(ctx.supabase, { workspaceId: ctx.workspace.id, clientId: data.client_id, entityType: "request", entityId: requestId, action: "sent" });
    revalidatePath(`/admin/requests/${requestId}`);
  }
}

export async function markRemindedAction(requestId: string) {
  await setRequest(requestId, { last_reminded_at: new Date().toISOString() }, "reminded");
}

export async function revokeRequestAction(requestId: string) {
  await setRequest(requestId, { revoked_at: new Date().toISOString() }, "revoked");
}

/** Reopen a submitted or revoked link so the client can edit and submit again. */
export async function reopenRequestAction(requestId: string) {
  const ctx = await assertWritable();
  const { data: req } = await ctx.supabase.from("requests").select("status, submitted_at, sent_at").eq("id", requestId).single();
  if (!req) return;
  const wasSubmitted = Boolean(req.submitted_at);
  if (wasSubmitted) {
    await ctx.supabase.from("submissions").update({ submitted_at: null }).eq("request_id", requestId);
  }
  await setRequest(
    requestId,
    {
      revoked_at: null,
      ...(wasSubmitted ? { status: "in_progress", submitted_at: null } : {}),
      ...(req.status === "draft" ? {} : { sent_at: req.sent_at ?? new Date().toISOString() }),
    },
    "reopened",
  );
}

export async function duplicateRequestAction(requestId: string) {
  const ctx = await assertWritable();
  const { data: req } = await ctx.supabase
    .from("requests")
    .select("client_id, project_id, template_id, personal_message")
    .eq("id", requestId)
    .single();
  if (!req) return;
  const { id } = await insertRequest(ctx.supabase, {
    workspaceId: ctx.workspace.id,
    clientId: req.client_id,
    projectId: req.project_id,
    templateId: req.template_id,
    personalMessage: req.personal_message,
    expiresAt: null,
  });
  await logActivity(ctx.supabase, { workspaceId: ctx.workspace.id, clientId: req.client_id, entityType: "request", entityId: id, action: "created", meta: { duplicated_from: requestId } });
  redirect(`/admin/requests/${id}?created=1`);
}

export async function deleteRequestAction(requestId: string) {
  const ctx = await assertWritable();
  await ctx.supabase.from("requests").delete().eq("id", requestId).in("status", ["draft", "sent", "opened"]);
  revalidatePath("/admin/requests");
  redirect("/admin/requests");
}

export async function updateExpiryAction(requestId: string, formData: FormData) {
  const value = nullIfEmpty(formData.get("expires_at"));
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  await setRequest(requestId, { expires_at: value ? `${value}T23:59:59Z` : null }, "expiry_changed");
}
