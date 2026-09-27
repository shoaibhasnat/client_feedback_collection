import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { cn, formatDate, humanize } from "@/lib/utils";

export const metadata: Metadata = { title: "Testimonials" };

export default async function TestimonialsPage({ searchParams }: PageProps<"/admin/testimonials">) {
  const sp = await searchParams;
  const view = sp.view === "all" ? "all" : "inbox";
  const { supabase, readOnly } = await requireOwner();

  const tabs = (
    <nav className="mb-4 flex gap-2" aria-label="Testimonial views">
      {[
        { key: "inbox", label: "Inbox", href: "/admin/testimonials" },
        { key: "all", label: "All testimonials", href: "/admin/testimonials?view=all" },
      ].map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={view === t.key ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-1 text-sm",
            view === t.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  const header = (
    <PageHeader
      title="Testimonials"
      actions={!readOnly && <LinkButton href="/admin/testimonials/new" variant="outline">Add manually</LinkButton>}
    />
  );

  if (view === "inbox") {
    const { data: subs } = await supabase
      .from("submissions")
      .select("id, rating, consent_level, submitted_at, merge_status, answers, requests!inner(status, clients(name), projects(name)), testimonials(id)")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(200);

    const rows = (subs ?? []).map((s) => {
      const req = s.requests as unknown as { status: string; clients: { name: string }; projects: { name: string } | null };
      const t = s.testimonials as unknown as { id: string } | { id: string }[] | null;
      const hasTestimonial = Array.isArray(t) ? t.length > 0 : Boolean(t);
      const firstAnswer = Object.values((s.answers ?? {}) as Record<string, unknown>).find((v) => typeof v === "string" && v.length > 0) as string | undefined;
      return { ...s, req, hasTestimonial, firstAnswer, needsReview: req.status === "submitted" };
    });

    return (
      <>
        {header}
        {tabs}
        {!rows.length ? (
          <EmptyState title="No submissions yet.">Share a request link and answers will appear here.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/admin/testimonials/review/${s.id}`}
                  className={cn(
                    "block rounded-xl border bg-white p-4 hover:border-slate-400",
                    s.needsReview ? "border-violet-300" : "border-slate-200",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {s.req.clients.name}
                      <span className="font-normal text-slate-500"> · {s.req.projects?.name ?? "No project"}</span>
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      {s.needsReview && <Badge tone="purple">New</Badge>}
                      {s.merge_status === "pending" && <Badge tone="amber">Profile updates</Badge>}
                      {s.rating && <span className="text-amber-500">{"★".repeat(s.rating)}</span>}
                      <Badge>{humanize(s.req.status)}</Badge>
                      <span className="text-slate-500">{formatDate(s.submitted_at)}</span>
                    </div>
                  </div>
                  {s.firstAnswer && <p className="mt-2 line-clamp-2 text-sm text-slate-600">“{s.firstAnswer}”</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const { data: items } = await supabase
    .from("testimonials")
    .select("id, submission_id, display_quote, display_name, source, visibility, featured, rating, date, clients(name)")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <>
      {header}
      {tabs}
      {!items?.length ? (
        <EmptyState title="No testimonials yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Quote</Th>
              <Th>Name</Th>
              <Th>Source</Th>
              <Th>Visibility</Th>
              <Th>Rating</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <Td className="max-w-md">
                  <Link
                    href={t.submission_id ? `/admin/testimonials/review/${t.submission_id}` : `/admin/testimonials/${t.id}`}
                    className="line-clamp-2 text-slate-900 hover:underline"
                  >
                    {t.display_quote || <em className="text-slate-400">No display quote yet</em>}
                  </Link>
                  {t.featured && <Badge tone="amber" className="mt-1">Featured</Badge>}
                </Td>
                <Td>{t.display_name ?? (t.clients as unknown as { name: string } | null)?.name ?? "—"}</Td>
                <Td>{humanize(t.source)}</Td>
                <Td>
                  <Badge tone={t.visibility === "published" ? "green" : t.visibility === "private" ? "red" : "slate"}>{t.visibility}</Badge>
                </Td>
                <Td className="text-amber-500">{t.rating ? "★".repeat(t.rating) : "—"}</Td>
                <Td>{formatDate(t.date)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
