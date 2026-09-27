import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipHash } from "@/lib/crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Platform audit log (super admin actions, sign-ins). Written with the service role. */
export async function logAudit(entry: {
  actorUserId: string | null;
  workspaceId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("audit_log").insert({
    actor_user_id: entry.actorUserId,
    workspace_id: entry.workspaceId ?? null,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    meta: entry.meta ?? {},
    ip_hash: await ipHash(),
  });
}

/** Workspace activity timeline entry. Pass the RLS client for owner actions. */
export async function logActivity(
  supabase: SupabaseClient,
  entry: {
    workspaceId?: string;
    clientId?: string | null;
    entityType: string;
    entityId?: string | null;
    action: string;
    meta?: Record<string, unknown>;
  },
) {
  await supabase.from("activity_log").insert({
    ...(entry.workspaceId ? { workspace_id: entry.workspaceId } : {}),
    client_id: entry.clientId ?? null,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    action: entry.action,
    meta: entry.meta ?? {},
  });
}
