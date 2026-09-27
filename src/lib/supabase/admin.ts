import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, serverEnv } from "@/lib/env";
import { realtimeOptions } from "@/lib/supabase/transport";

/**
 * Service-role client. Bypasses Row Level Security, so every query made with it
 * MUST be scoped explicitly (by workspace_id, request token or super-admin check).
 * Used only for: the public client form (token-scoped), invite acceptance,
 * the super admin panel (metadata only) and audit logging.
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl, serverEnv().serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...realtimeOptions,
  });
}
