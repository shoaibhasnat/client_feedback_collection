import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  is_super_admin: boolean;
  status: "active" | "disabled";
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deleted";
};

/** Verified user + profile for this request (JWT verified via getClaims / getUser). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url, is_super_admin, status")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return { supabase, user, profile: profile ?? null };
});

/** For /admin: signed-in, active, and owner of exactly one workspace. */
export const requireOwner = cache(async () => {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/login");
  if (profile.status !== "active") redirect("/login?error=disabled");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(id, name, slug, status)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const workspace = (membership?.workspaces ?? null) as unknown as Workspace | null;
  if (!workspace || workspace.status === "deleted") {
    if (profile.is_super_admin) redirect("/superadmin");
    redirect("/login?error=no-workspace");
  }
  return { supabase, user, profile, workspace, readOnly: workspace.status !== "active" };
});

/** For /superadmin: checked on the server for every request (brief 10.4). */
export const requireSuperAdmin = cache(async () => {
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/login?next=/superadmin");
  if (!profile.is_super_admin || profile.status !== "active") redirect("/admin");
  return { supabase, user, profile };
});

/** Throwing variant for server actions, where redirecting mid-mutation is surprising. */
export async function assertWritable() {
  const ctx = await requireOwner();
  if (ctx.readOnly) throw new Error("This workspace is suspended and read-only.");
  return ctx;
}
