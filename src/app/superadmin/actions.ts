"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";

// Every action re-checks super-admin status on the server (brief 10.4) and only ever
// touches platform metadata: workspaces, users, invites, settings. Never business data.

const RESERVED_SLUGS = new Set([
  "admin", "superadmin", "login", "logout", "invite", "t", "c", "api", "auth", "forgot-password",
  "reset-password", "love", "static", "_next", "public", "settings", "app", "www",
]);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/, "Use lowercase letters, numbers and dashes (max 50).")
  .refine((s) => !RESERVED_SLUGS.has(s), "That slug is reserved.");

export type CreateWorkspaceState = { error?: string; inviteUrl?: string; workspaceName?: string };

export async function createWorkspace(_prev: CreateWorkspaceState, formData: FormData): Promise<CreateWorkspaceState> {
  const { user } = await requireSuperAdmin();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter a workspace name.").max(120),
      slug: slugSchema,
      email: z.email("Enter the owner's email.").max(320),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { data: ws, error } = await admin
    .from("workspaces")
    .insert({ name: parsed.data.name, slug: parsed.data.slug })
    .select("id")
    .single();
  if (error) {
    return { error: error.code === "23505" ? "That slug is already taken." : "Could not create the workspace." };
  }

  const { error: seedError } = await admin.rpc("seed_workspace", { ws: ws.id });
  if (seedError) {
    await admin.from("workspaces").delete().eq("id", ws.id);
    return { error: `Seeding failed: ${seedError.message}` };
  }

  const invite = await issueInvite({ workspaceId: ws.id, email: parsed.data.email, createdBy: user.id });
  await logAudit({
    actorUserId: user.id,
    workspaceId: ws.id,
    action: "workspace.created",
    targetType: "workspace",
    targetId: ws.id,
    meta: { slug: parsed.data.slug, owner_email: parsed.data.email.toLowerCase() },
  });
  revalidatePath("/superadmin");
  return { inviteUrl: invite.url, workspaceName: parsed.data.name };
}

export type InviteLinkState = { error?: string; inviteUrl?: string };

export async function regenerateInvite(workspaceId: string, _prev: InviteLinkState, formData: FormData): Promise<InviteLinkState> {
  const { user } = await requireSuperAdmin();
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email." };

  const admin = createAdminClient();
  const { data: member } = await admin.from("workspace_members").select("id").eq("workspace_id", workspaceId).maybeSingle();
  if (member) return { error: "This workspace already has an owner." };

  const invite = await issueInvite({ workspaceId, email: email.data, createdBy: user.id });
  await logAudit({
    actorUserId: user.id,
    workspaceId,
    action: "invite.regenerated",
    targetType: "invite",
    targetId: invite.id,
    meta: { email: email.data.toLowerCase() },
  });
  revalidatePath("/superadmin", "layout");
  return { inviteUrl: invite.url };
}

export async function revokeInvite(inviteId: string) {
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("workspace_id")
    .maybeSingle();
  if (data) {
    await logAudit({ actorUserId: user.id, workspaceId: data.workspace_id, action: "invite.revoked", targetType: "invite", targetId: inviteId });
  }
  revalidatePath("/superadmin", "layout");
}

export async function setWorkspaceStatus(workspaceId: string, status: "active" | "suspended") {
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();
  await admin.from("workspaces").update({ status }).eq("id", workspaceId).neq("status", "deleted");
  await logAudit({
    actorUserId: user.id,
    workspaceId,
    action: status === "suspended" ? "workspace.suspended" : "workspace.reactivated",
    targetType: "workspace",
    targetId: workspaceId,
  });
  revalidatePath("/superadmin", "layout");
}

export type UpdateWorkspaceState = { error?: string; ok?: boolean };

export async function updateWorkspace(workspaceId: string, _prev: UpdateWorkspaceState, formData: FormData): Promise<UpdateWorkspaceState> {
  const { user } = await requireSuperAdmin();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(120), slug: slugSchema })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { data: before } = await admin.from("workspaces").select("name, slug").eq("id", workspaceId).single();
  const { error } = await admin.from("workspaces").update(parsed.data).eq("id", workspaceId);
  if (error) return { error: error.code === "23505" ? "That slug is already taken." : error.message };

  await logAudit({
    actorUserId: user.id,
    workspaceId,
    action: "workspace.updated",
    targetType: "workspace",
    targetId: workspaceId,
    meta: { before, after: parsed.data },
  });
  revalidatePath("/superadmin", "layout");
  return { ok: true };
}

export async function setUserStatus(userId: string, status: "active" | "disabled") {
  const { user } = await requireSuperAdmin();
  if (userId === user.id) throw new Error("You can't disable your own account.");
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("is_super_admin").eq("id", userId).single();
  if (target?.is_super_admin) throw new Error("Super admin accounts are managed in the database.");

  await admin.auth.admin.updateUserById(userId, { ban_duration: status === "disabled" ? "876000h" : "none" });
  await admin.from("profiles").update({ status }).eq("id", userId);
  await logAudit({
    actorUserId: user.id,
    action: status === "disabled" ? "user.disabled" : "user.enabled",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath("/superadmin/users");
}

export async function forcePasswordReset(userId: string) {
  const { user } = await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("email").eq("id", userId).single();
  if (!target) return;
  // Signs the user out everywhere, then sends the auth provider's built-in reset email.
  await admin.auth.admin.updateUserById(userId, { password: crypto.randomUUID() + crypto.randomUUID() });
  await admin.auth.resetPasswordForEmail(target.email, { redirectTo: `${env.appUrl}/auth/confirm?next=/reset-password` });
  await logAudit({ actorUserId: user.id, action: "user.password_reset_forced", targetType: "user", targetId: userId });
  revalidatePath("/superadmin/users");
}

export type GlobalSettingsState = { error?: string; ok?: boolean };

export async function updateGlobalSettings(_prev: GlobalSettingsState, formData: FormData): Promise<GlobalSettingsState> {
  const { user } = await requireSuperAdmin();
  const parsed = z
    .object({
      app_name: z.string().trim().min(1).max(80),
      invite_expiry_days: z.coerce.number().int().min(1).max(90),
      announcement: z.string().trim().max(500),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  await admin
    .from("global_settings")
    .update({ ...parsed.data, announcement: parsed.data.announcement || null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  await logAudit({ actorUserId: user.id, action: "settings.updated", targetType: "global_settings", meta: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true };
}
