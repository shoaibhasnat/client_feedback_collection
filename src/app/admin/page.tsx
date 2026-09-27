import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Alert, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const { supabase, workspace, readOnly } = await requireOwner();

  const { data: settings } = await supabase
    .from("site_settings")
    .select("profile, message_templates")
    .eq("workspace_id", workspace.id)
    .single();
  const reminderDays = Number((settings?.message_templates as Record<string, unknown>)?.reminder_days ?? 3);
  const staleBefore = daysAgoIso(reminderDays);

  const [testimonials, published, awaiting, submitted, stale, ratings, clientCount, requestCount] = await Promise.all([
    supabase.from("testimonials").select("id", { count: "exact", head: true }),
    supabase.from("testimonials").select("id", { count: "exact", head: true }).eq("visibility", "published"),
    supabase.from("requests").select("id", { count: "exact", head: true }).in("status", ["sent", "opened", "in_progress"]).is("revoked_at", null),
    supabase
      .from("requests")
      .select("id, submitted_at, clients(name), projects(name), submissions(id)")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(10),
    supabase
      .from("requests")
      .select("id, sent_at, last_reminded_at, status, clients(name)")
      .in("status", ["sent", "opened", "in_progress"])
      .is("revoked_at", null)
      .lt("sent_at", staleBefore)
      .order("sent_at", { ascending: true })
      .limit(10),
    supabase.from("submissions").select("rating").not("submitted_at", "is", null).not("rating", "is", null),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("requests").select("id", { count: "exact", head: true }),
  ]);

  const ratingValues = (ratings.data ?? []).map((r) => r.rating as number);
  const avg = ratingValues.length ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1) : "—";
  const profile = (settings?.profile ?? {}) as Record<string, string | null>;

  const checklist = [
    { done: Boolean(profile.name && (profile.tagline || profile.photo_url)), label: "Complete your profile", href: "/admin/settings" },
    { done: false, label: "Set up branding (arrives with the public page)", href: "/admin/settings", later: true },
    { done: (clientCount.count ?? 0) > 0, label: "Add your first client", href: "/admin/clients/new" },
    { done: (requestCount.count ?? 0) > 0, label: "Send your first request", href: "/admin/requests/new" },
  ];
  const showChecklist = sp.welcome === "1" || checklist.some((c) => !c.done && !c.later);

  const stats = [
    { label: "Testimonials", value: testimonials.count ?? 0 },
    { label: "Published", value: published.count ?? 0 },
    { label: "Pending review", value: submitted.data?.length ?? 0 },
    { label: "Awaiting response", value: awaiting.count ?? 0 },
    { label: "Average rating", value: avg },
  ];

  return (
    <>
      <PageHeader
        title="Home"
        description={
          <a href={`/${workspace.slug}`} target="_blank" rel="noreferrer" className="font-medium text-slate-700 underline-offset-2 hover:underline">
            View your public page ↗
          </a>
        }
        actions={
          !readOnly && (
            <>
              <LinkButton href="/admin/clients/new" variant="outline">
                Add client
              </LinkButton>
              <LinkButton href="/admin/testimonials/new" variant="outline">
                Add testimonial
              </LinkButton>
              <LinkButton href="/admin/requests/new">Send request</LinkButton>
            </>
          )
        }
      />

      {sp.welcome === "1" && (
        <Alert tone="green" className="mb-6">
          Welcome to your workspace. Everything here is private to you. Start with the checklist below.
        </Alert>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {showChecklist && (
          <Card className="lg:col-span-2">
            <CardHeader title="Getting started" />
            <ul className="divide-y divide-slate-100">
              {checklist.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    {item.done ? (
                      <CheckCircle2 className="size-5 text-emerald-600" aria-label="Done" />
                    ) : (
                      <Circle className="size-5 text-slate-300" aria-label="To do" />
                    )}
                    <span className={item.done ? "text-slate-500 line-through" : "text-slate-900"}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader title="New submissions to review" />
          <ul className="divide-y divide-slate-100">
            {(submitted.data ?? []).map((r) => {
              const sub = (r.submissions as unknown as { id: string }[] | { id: string } | null);
              const subId = Array.isArray(sub) ? sub[0]?.id : sub?.id;
              return (
                <li key={r.id}>
                  <Link
                    href={subId ? `/admin/testimonials/review/${subId}` : `/admin/requests/${r.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50"
                  >
                    <span>
                      <span className="font-medium text-slate-900">{(r.clients as unknown as { name: string })?.name}</span>
                      <span className="text-slate-500"> · {(r.projects as unknown as { name: string } | null)?.name ?? "No project"}</span>
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(r.submitted_at)}</span>
                  </Link>
                </li>
              );
            })}
            {!submitted.data?.length && <li className="px-5 py-4 text-sm text-slate-500">Nothing waiting.</li>}
          </ul>
        </Card>

        <Card>
          <CardHeader title={`No response after ${reminderDays} days`} description="Copy a reminder message from the request page." />
          <ul className="divide-y divide-slate-100">
            {(stale.data ?? []).map((r) => (
              <li key={r.id}>
                <Link href={`/admin/requests/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                  <span className="font-medium text-slate-900">{(r.clients as unknown as { name: string })?.name}</span>
                  <span className="text-xs text-slate-500">
                    Sent {formatDate(r.sent_at)}
                    {r.last_reminded_at && ` · reminded ${formatDate(r.last_reminded_at)}`}
                  </span>
                </Link>
              </li>
            ))}
            {!stale.data?.length && <li className="px-5 py-4 text-sm text-slate-500">All caught up.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
