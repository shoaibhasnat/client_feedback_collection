import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { requireOwner } from "@/lib/auth";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · Dashboard" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { supabase, profile, workspace, readOnly } = await requireOwner();

  const [{ data: global }, { count: toReview }] = await Promise.all([
    supabase.from("global_settings").select("announcement").eq("id", 1).maybeSingle(),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
  ]);

  const banner = (
    <>
      {readOnly && (
        <div role="status" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          This workspace is suspended. You can view your data but not change it, and request links are paused.
        </div>
      )}
      {global?.announcement && (
        <div role="status" className="bg-slate-900 px-4 py-2 text-center text-sm text-white">
          {global.announcement}
        </div>
      )}
    </>
  );

  return (
    <AppShell
      brand={workspace.name}
      subtitle="Testimonial Collector"
      userLabel={profile.email}
      banner={banner}
      nav={[
        { href: "/admin", label: "Home", exact: true },
        { href: "/admin/clients", label: "Clients" },
        { href: "/admin/projects", label: "Projects" },
        { href: "/admin/requests", label: "Requests" },
        { href: "/admin/testimonials", label: "Testimonials", badge: toReview ?? 0 },
        { href: "/admin/collections", label: "Collections" },
        { href: "/admin/forms", label: "Forms" },
        { href: "/admin/settings", label: "Site & Settings" },
      ]}
    >
      {children}
    </AppShell>
  );
}
