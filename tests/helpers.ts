import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { realtimeOptions } from "@/lib/supabase/transport";

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  throw new Error("Tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (.env.local).");
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false }, ...realtimeOptions };

export function adminClient() {
  return createClient(url, serviceKey, noSession);
}

export function anonClient() {
  return createClient(url, anonKey, noSession);
}

export const runId = randomBytes(4).toString("hex");

export type Tenant = {
  workspaceId: string;
  userId: string;
  email: string;
  password: string;
  client: SupabaseClient; // signed in as this tenant's owner
  ids: Record<string, string>;
  token: string;
  filePath: string;
};

/** Create a workspace + owner + one row in every business table + one storage object. */
export async function createTenant(label: string): Promise<Tenant> {
  const admin = adminClient();
  const slug = `iso-${label}-${runId}`;
  const { data: ws, error: wsError } = await admin.from("workspaces").insert({ name: `Isolation ${label}`, slug }).select("id").single();
  if (wsError) throw wsError;
  const { error: seedError } = await admin.rpc("seed_workspace", { ws: ws.id });
  if (seedError) throw seedError;

  const email = `owner-${label}-${runId}@example.test`;
  const password = `pw-${randomBytes(12).toString("hex")}`;
  const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (userError) throw userError;
  const userId = created.user.id;
  await admin.from("workspace_members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });

  const w = ws.id as string;
  const one = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await admin.from(table).insert({ workspace_id: w, ...row }).select("id").single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data.id as string;
  };

  const { data: template } = await admin.from("form_templates").select("id").eq("workspace_id", w).single();
  const { data: formItem } = await admin.from("form_items").select("id").eq("workspace_id", w).limit(1).single();
  const { data: settings } = await admin.from("site_settings").select("id").eq("workspace_id", w).single();

  const ids: Record<string, string> = {
    form_templates: template!.id,
    form_items: formItem!.id,
    site_settings: settings!.id,
  };
  ids.clients = await one("clients", { name: `Secret client ${label}`, emails: [`secret-${label}@example.test`] });
  ids.client_notes = await one("client_notes", { client_id: ids.clients, body: `Private note ${label}` });
  ids.projects = await one("projects", { client_id: ids.clients, name: `Project ${label}`, budget: 5000 });
  ids.attachments = await one("attachments", { owner_type: "project", owner_id: ids.projects, file_url: `${w}/x.pdf`, file_name: "x.pdf" });
  const token = randomBytes(24).toString("base64url");
  ids.requests = await one("requests", {
    client_id: ids.clients,
    project_id: ids.projects,
    template_id: template!.id,
    template_snapshot: { version: 1, items: [] },
    token,
  });
  ids.submissions = await one("submissions", { request_id: ids.requests, answers: { result: `Secret answer ${label}` } });
  ids.testimonials = await one("testimonials", { submission_id: ids.submissions, client_id: ids.clients, display_quote: `Quote ${label}` });
  ids.tags = await one("tags", { name: "Shopify" }); // same name in both workspaces on purpose
  ids.testimonial_tags = await one("testimonial_tags", { testimonial_id: ids.testimonials, tag_id: ids.tags });
  ids.client_tags = await one("client_tags", { client_id: ids.clients, tag_id: ids.tags });
  ids.collections = await one("collections", { name: "Stores", slug: "stores" });
  ids.collection_items = await one("collection_items", { collection_id: ids.collections, testimonial_id: ids.testimonials });
  ids.widgets = await one("widgets", { name: "Wall" });
  ids.theme_versions = await one("theme_versions", { theme: {} });
  ids.settings_custom_fields = await one("settings_custom_fields", { entity: "client", key: "team_size", label: "Team size", type: "number" });
  ids.activity_log = await one("activity_log", { client_id: ids.clients, entity_type: "client", action: "created" });

  const filePath = `${w}/clients/${ids.clients}/secret.png`;
  // 1x1 PNG
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const { error: upError } = await admin.storage.from("uploads").upload(filePath, png, { contentType: "image/png" });
  if (upError) throw upError;

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { workspaceId: w, userId, email, password, client, ids, token, filePath };
}

export async function destroyTenant(t: Tenant | undefined) {
  if (!t) return;
  const admin = adminClient();
  await admin.storage.from("uploads").remove([t.filePath]);
  await admin.from("workspaces").delete().eq("id", t.workspaceId);
  await admin.auth.admin.deleteUser(t.userId);
}

export const BUSINESS_TABLES = [
  "clients",
  "client_notes",
  "projects",
  "attachments",
  "form_templates",
  "form_items",
  "requests",
  "submissions",
  "testimonials",
  "tags",
  "testimonial_tags",
  "client_tags",
  "collections",
  "collection_items",
  "widgets",
  "site_settings",
  "theme_versions",
  "settings_custom_fields",
  "activity_log",
] as const;

/** Safety net: remove anything this run created even if setup failed half-way. */
export async function cleanupRun() {
  const admin = adminClient();
  await admin.from("workspaces").delete().like("slug", `iso-%-${runId}`);
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith(`-${runId}@example.test`)) await admin.auth.admin.deleteUser(u.id);
  }
}
