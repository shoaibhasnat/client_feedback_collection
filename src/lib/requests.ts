import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { buildSnapshot, type ClientRecord, type ProjectRecord } from "@/lib/form/snapshot";
import { cleanOverrideMap } from "@/lib/form/settings";
import type { FormItemRow, OverrideMap, TemplateCopy, TemplateSettings } from "@/lib/form/types";
import { fillTemplate, firstName } from "@/lib/utils";

export function requestUrl(token: string) {
  return `${env.appUrl}/t/${token}`;
}

/** Load everything needed to snapshot a template for one client/project (RLS-scoped client). */
export async function prepareSnapshot(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    clientId: string;
    projectId: string | null;
    templateId: string | null;
    /** Per-request settings from the "Customize form" step (brief §3.7). */
    overrides?: OverrideMap;
  },
) {
  const templateQuery = supabase.from("form_templates").select("id, name, settings, copy").is("archived_at", null);
  const [{ data: client }, { data: project }, { data: template }, { data: settings }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", args.clientId).maybeSingle(),
    args.projectId
      ? supabase.from("projects").select("*").eq("id", args.projectId).eq("client_id", args.clientId).maybeSingle()
      : Promise.resolve({ data: null }),
    args.templateId
      ? templateQuery.eq("id", args.templateId).maybeSingle()
      : templateQuery.eq("is_default", true).maybeSingle(),
    supabase.from("site_settings").select("profile").eq("workspace_id", args.workspaceId).maybeSingle(),
  ]);

  if (!client) throw new Error("Client not found.");
  if (args.projectId && !project) throw new Error("That project doesn't belong to this client.");
  if (!template) throw new Error("Form template not found.");

  const { data: items } = await supabase.from("form_items").select("*").eq("template_id", template.id);
  const profile = (settings?.profile ?? {}) as Record<string, string | null>;
  const rows = ((items ?? []) as FormItemRow[]).filter((i) => !i.archived_at);

  const built = buildSnapshot({
    template: {
      id: template.id,
      name: template.name,
      settings: template.settings as Partial<TemplateSettings>,
      copy: template.copy as TemplateCopy,
    },
    items: rows,
    client: client as ClientRecord,
    project: project as ProjectRecord | null,
    overrides: args.overrides,
    owner: {
      name: profile.name ?? "",
      // Stored as a private storage path; the public form signs it at render time.
      photo_url: profile.photo_url ?? null,
      tagline: profile.tagline ?? "",
      share_url: profile.share_url ?? "",
    },
  });
  return {
    ...built,
    rows,
    templateSettings: template.settings as Partial<TemplateSettings>,
    clientDefaults: cleanOverrideMap(client.form_defaults),
  };
}

export async function insertRequest(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    clientId: string;
    projectId: string | null;
    templateId: string | null;
    personalMessage: string | null;
    expiresAt: string | null;
    overrides?: OverrideMap;
  },
) {
  const { snapshot, warnings } = await prepareSnapshot(supabase, args);
  const { data, error } = await supabase
    .from("requests")
    .insert({
      workspace_id: args.workspaceId,
      client_id: args.clientId,
      project_id: args.projectId,
      template_id: snapshot.template.id,
      template_snapshot: snapshot,
      item_overrides: cleanOverrideMap(args.overrides),
      token: randomToken(24),
      personal_message: args.personalMessage,
      expires_at: args.expiresAt,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, warnings };
}

/**
 * PostgREST filter for sent requests that need a nudge: nothing heard since `before`, counting
 * from the last reminder if there was one, otherwise from when the link was sent.
 */
export function needsReminderFilter(before: string): string {
  return `last_reminded_at.lt.${before},and(last_reminded_at.is.null,sent_at.lt.${before})`;
}

export type MessageKind = "upwork" | "email" | "whatsapp" | "reminder";

export function buildMessage(
  templates: Record<string, unknown>,
  kind: MessageKind,
  vars: { clientName: string; projectName: string | null; link: string; ownerName: string },
) {
  const text = typeof templates[kind] === "string" ? (templates[kind] as string) : "{link}";
  return fillTemplate(text, {
    client_first_name: firstName(vars.clientName) || "there",
    client_name: vars.clientName,
    project_name: vars.projectName ?? "our project",
    owner_name: vars.ownerName,
    link: vars.link,
  });
}
