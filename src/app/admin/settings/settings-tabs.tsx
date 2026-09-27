"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/settings", label: "Profile & account" },
  { href: "/admin/settings/appearance", label: "Appearance" },
  { href: "/admin/settings/messages", label: "Messages & presets" },
  { href: "/admin/settings/fields", label: "Custom fields" },
  { href: "/admin/settings/tags", label: "Tags" },
  { href: "/admin/settings/data", label: "Data" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
