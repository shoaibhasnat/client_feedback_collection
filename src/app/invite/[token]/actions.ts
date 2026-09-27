"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { lookupInvite } from "@/lib/invites";
import { logAudit } from "@/lib/audit";
import { clientIp } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

export type InviteState = { error?: string };

export async function acceptInvite(token: string, _prev: InviteState, formData: FormData): Promise<InviteState> {
  const ip = await clientIp();
  if (!rateLimit(`invite:${ip}`, 10, 10 * 60_000)) return { error: "Too many attempts. Try again later." };

  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (name.length < 1 || name.length > 120) return { error: "Enter your name." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  if (password !== confirm) return { error: "The passwords don't match." };

  const lookup = await lookupInvite(token);
  if (lookup.state !== "valid") return { error: "This invite link is no longer valid." };
  const { invite } = lookup;
  const admin = createAdminClient();

  // Claim the invite first so it can only ever be used once, even under concurrent requests.
  const { data: claimed } = await admin
    .from("invites")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return { error: "This invite link has already been used." };

  const release = () => admin.from("invites").update({ status: "pending", accepted_at: null }).eq("id", invite.id);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createError || !created.user) {
    await release();
    const exists = createError?.message?.toLowerCase().includes("already");
    return { error: exists ? "An account with this email already exists. Ask the administrator for help." : "Could not create your account. Try again." };
  }

  const userId = created.user.id;
  await admin.from("profiles").update({ name }).eq("id", userId);
  const { error: memberError } = await admin
    .from("workspace_members")
    .insert({ workspace_id: invite.workspace_id, user_id: userId, role: "owner" });
  if (memberError) {
    await admin.auth.admin.deleteUser(userId);
    await release();
    return { error: "Could not join the workspace. Try again." };
  }

  // Put the owner's name on their public profile if it isn't set yet.
  const { data: settings } = await admin
    .from("site_settings")
    .select("profile")
    .eq("workspace_id", invite.workspace_id)
    .single();
  const profile = (settings?.profile ?? {}) as Record<string, unknown>;
  if (!profile.name) {
    await admin
      .from("site_settings")
      .update({ profile: { ...profile, name } })
      .eq("workspace_id", invite.workspace_id);
  }

  await logAudit({
    actorUserId: userId,
    workspaceId: invite.workspace_id,
    action: "invite.accepted",
    targetType: "invite",
    targetId: invite.id,
  });

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: invite.email, password });
  await admin.from("profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("id", userId);
  redirect("/admin?welcome=1");
}
