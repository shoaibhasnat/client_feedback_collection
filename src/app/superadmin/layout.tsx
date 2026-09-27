import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { requireSuperAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Super admin" };

export default async function SuperAdminLayout({ children }: LayoutProps<"/superadmin">) {
  const { profile } = await requireSuperAdmin();
  return (
    <AppShell
      brand="Testimonial Collector"
      subtitle="Super admin"
      userLabel={profile.email}
      nav={[
        { href: "/superadmin", label: "Workspaces", exact: true },
        { href: "/superadmin/users", label: "Users" },
        { href: "/superadmin/invites", label: "Invites" },
        { href: "/superadmin/audit", label: "Audit log" },
        { href: "/superadmin/settings", label: "Settings" },
      ]}
    >
      {children}
    </AppShell>
  );
}
