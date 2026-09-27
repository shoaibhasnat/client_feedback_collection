import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Phase 1 has no public landing page; public walls arrive in Phase 3 at /{slug}.
export default async function Home() {
  const { user, profile } = await getSession();
  if (!user) redirect("/login");
  redirect(profile?.is_super_admin ? "/superadmin" : "/admin");
}
