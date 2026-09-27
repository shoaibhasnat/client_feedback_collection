"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { insertRequest, prepareSnapshot } from "@/lib/requests";
import { buildSteps, estimateMinutes } from "@/lib/form/steps";
import { nullIfEmpty } from "@/lib/utils";

export type CreateRequestState = { error?: string };

const createSchema = z.object({
  client_id: z.uuid("Choose a client."),
  project_id: z.uuid().nullable(),
  template_id: z.uuid().nullable(),
  personal_message: z.string().max(1000).nullable(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

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

  let id: string;
  try {
    ({ id } = await insertRequest(ctx.supabase, {
      workspaceId: ctx.workspace.id,
      clientId: parsed.data.client_id,
      projectId: parsed.data.project_id,
      templateId: parsed.data.template_id,
      personalMessage: parsed.data.personal_message,
      // End of the chosen day, UTC.
      expiresAt: parsed.data.expires_at ? `${parsed.data.expires_at}T23:59:59Z` : null,
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
  });
  revalidatePath("/admin/requests");
  redirect(`/admin/requests/${id}?created=1`);
}

export type PreviewResult = {
  error?: string;
  screens?: string[];
  minutes?: number;
  warnings?: string[];
};

/** Live preview of what the client will see, before the request is created. */
export async function previewRequestAction(input: {
  clientId: string;
  projectId: string | null;
  templateId: string | null;
}): Promise<PreviewResult> {
  const ctx = await assertWritable();
  try {
    const { snapshot, warnings } = await prepareSnapshot(ctx.supabase, {
      workspaceId: ctx.workspace.id,
      clientId: input.clientId,
      projectId: input.projectId,
      templateId: input.templateId,
    });
    const screens = buildSteps(snapshot).map((s) => {
      switch (s.kind) {
        case "welcome":
          return "Welcome";
        case "rating":
          return "Star rating";
        case "question":
          return `Question ${s.index + 1}: ${s.item.label}`;
        case "about":
          return `About you (${s.items.length} fields)`;
        case "contact":
          return `Contact details (${s.items.length} fields, private)`;
        case "consent":
          return "Consent";
      }
    });
    return { screens: [...screens, "Thank you"], minutes: estimateMinutes(snapshot), warnings };
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
