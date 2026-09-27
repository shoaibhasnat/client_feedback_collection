"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; exact?: boolean; badge?: number };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-4">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            {item.label}
            {!!item.badge && (
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-slate-200 text-slate-700")}>
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
