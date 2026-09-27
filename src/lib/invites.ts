import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";

export type InviteLookup =
  | { state: "valid"; invite: { id: string; email: string; workspace_id: string; expires_at: string }; workspaceName: string }
  | { state: "invalid" | "expired" | "used" | "revoked" };

export async function lookupInvite(token: string): Promise<InviteLookup> {
  if (!token || token.length < 20 || token.length > 100) return { state: "invalid" };
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("invites")
    .select("id, email, workspace_id, status, expires_at, workspaces(name, status)")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!invite) return { state: "invalid" };

  const ws = invite.workspaces as unknown as { name: string; status: string } | null;
  if (!ws || ws.status === "deleted") return { state: "invalid" };
  if (invite.status === "accepted") return { state: "used" };
  if (invite.status === "revoked") return { state: "revoked" };
  if (invite.status === "expired" || new Date(invite.expires_at) < new Date()) {
    if (invite.status === "pending") await admin.from("invites").update({ status: "expired" }).eq("id", invite.id);
    return { state: "expired" };
  }
  return {
    state: "valid",
    invite: { id: invite.id, email: invite.email, workspace_id: invite.workspace_id, expires_at: invite.expires_at },
    workspaceName: ws.name,
  };
}

/** Create a fresh single-use invite link; any earlier pending invite for the workspace is revoked. */
export async function issueInvite(args: { workspaceId: string; email: string; createdBy: string }) {
  const admin = createAdminClient();
  const { data: settings } = await admin.from("global_settings").select("invite_expiry_days").eq("id", 1).single();
  const days = settings?.invite_expiry_days ?? 7;

  await admin
    .from("invites")
    .update({ status: "revoked" })
    .eq("workspace_id", args.workspaceId)
    .eq("status", "pending");

  const token = randomToken(32);
  const { data, error } = await admin
    .from("invites")
    .insert({
      workspace_id: args.workspaceId,
      email: args.email.toLowerCase(),
      token_hash: sha256(token),
      created_by: args.createdBy,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // The plain token exists only in this return value; only its hash is stored.
  return { id: data.id as string, url: `${env.appUrl}/invite/${token}` };
}
