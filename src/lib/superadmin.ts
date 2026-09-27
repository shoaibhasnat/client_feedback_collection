import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deleted";
  created_at: string;
  owner: { id: string; name: string | null; email: string } | null;
  pendingInvite: { id: string; email: string; expires_at: string } | null;
  stats: { clients: number; testimonials: number; requests: number; videos: number; storage_bytes: number; last_activity_at: string | null };
};

/** Metadata and counts only — the super admin never sees business content (brief 10.4). */
export async function listWorkspaces(search?: string): Promise<WorkspaceRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("workspaces")
    .select("id, name, slug, status, created_at, workspace_members(profiles(id, name, email)), invites(id, email, status, expires_at)")
    .neq("status", "deleted")
    .order("created_at", { ascending: false });
  if (search) query = query.or(`name.ilike.%${search.replace(/[%,()]/g, "")}%,slug.ilike.%${search.replace(/[%,()]/g, "")}%`);

  const [{ data: workspaces }, { data: stats }] = await Promise.all([query, admin.rpc("superadmin_workspace_stats")]);
  const statsById = new Map((stats ?? []).map((s: { workspace_id: string }) => [s.workspace_id, s]));

  return (workspaces ?? []).map((w) => {
    const members = (w.workspace_members ?? []) as unknown as { profiles: { id: string; name: string | null; email: string } }[];
    const invites = (w.invites ?? []) as { id: string; email: string; status: string; expires_at: string }[];
    const pending = invites.find((i) => i.status === "pending" && new Date(i.expires_at) > new Date()) ?? null;
    const s = statsById.get(w.id) as WorkspaceRow["stats"] | undefined;
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      status: w.status,
      created_at: w.created_at,
      owner: members[0]?.profiles ?? null,
      pendingInvite: pending ? { id: pending.id, email: pending.email, expires_at: pending.expires_at } : null,
      stats: {
        clients: Number(s?.clients ?? 0),
        testimonials: Number(s?.testimonials ?? 0),
        requests: Number(s?.requests ?? 0),
        videos: Number(s?.videos ?? 0),
        storage_bytes: Number(s?.storage_bytes ?? 0),
        last_activity_at: s?.last_activity_at ?? null,
      },
    };
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
