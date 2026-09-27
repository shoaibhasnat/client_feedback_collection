import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { NavLinks, type NavItem } from "@/components/nav-links";

export function AppShell({
  brand,
  subtitle,
  nav,
  userLabel,
  banner,
  children,
}: {
  brand: string;
  subtitle?: string;
  nav: NavItem[];
  userLabel: string;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {banner}
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-slate-200 bg-white md:w-60 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 py-4 md:block md:px-5">
            <Link href={nav[0]?.href ?? "/"} className="block">
              <p className="text-sm font-semibold text-slate-900">{brand}</p>
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </Link>
          </div>
          <NavLinks items={nav} />
          <div className="hidden border-t border-slate-100 px-5 py-4 md:block">
            <p className="truncate text-xs text-slate-500" title={userLabel}>
              {userLabel}
            </p>
            <form action={signOut}>
              <button className="mt-1 text-sm font-medium text-slate-700 hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
          <form action={signOut} className="mt-10 md:hidden">
            <button className="text-sm text-slate-500">Sign out ({userLabel})</button>
          </form>
        </main>
      </div>
    </div>
  );
}
