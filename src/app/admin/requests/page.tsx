import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { REQUEST_STATUS_TONE } from "@/lib/constants";
import { cn, formatDate, humanize } from "@/lib/utils";
import { needsReminderFilter } from "@/lib/requests";

export const metadata: Metadata = { title: "Requests" };

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "open", label: "Awaiting response" },
  { key: "remind", label: "Needs a reminder" },
  { key: "submitted", label: "To review" },
  { key: "done", label: "Done" },
  { key: "revoked", label: "Revoked" },
] as const;

export default async function RequestsPage({ searchParams }: PageProps<"/admin/requests">) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "";
  const { supabase, workspace, readOnly } = await requireOwner();

  let query = supabase
    .from("requests")
    .select("id, status, created_at, sent_at, opened_at, submitted_at, expires_at, revoked_at, last_reminded_at, clients(id, name), projects(name)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter === "open") query = query.in("status", ["draft", "sent", "opened", "in_progress"]).is("revoked_at", null);
  if (filter === "remind") {
    const { data: settings } = await supabase.from("site_settings").select("message_templates").eq("workspace_id", workspace.id).single();
    const days = Number((settings?.message_templates as Record<string, unknown> | null)?.reminder_days ?? 3);
    query = query.in("status", ["sent", "opened", "in_progress"]).is("revoked_at", null).or(needsReminderFilter(daysAgoIso(days)));
  }
  if (filter === "submitted") query = query.eq("status", "submitted");
  if (filter === "done") query = query.in("status", ["reviewed", "published", "private"]);
  if (filter === "revoked") query = query.not("revoked_at", "is", null);
  const { data: requests } = await query;

  return (
    <>
      <PageHeader title="Requests" actions={!readOnly && <LinkButton href="/admin/requests/new">New request</LinkButton>} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter requests">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/requests?filter=${f.key}` : "/admin/requests"}
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              filter === f.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {!requests?.length ? (
        <EmptyState title="No requests here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Client</Th>
              <Th>Project</Th>
              <Th>Status</Th>
              <Th>Sent</Th>
              <Th>Opened</Th>
              <Th>Submitted</Th>
              <Th>Expires</Th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const client = r.clients as unknown as { id: string; name: string };
              const expired = r.expires_at && new Date(r.expires_at) < new Date() && !r.submitted_at;
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/admin/requests/${r.id}`} className="font-medium text-slate-900 hover:underline">
                      {client.name}
                    </Link>
                  </Td>
                  <Td>{(r.projects as unknown as { name: string } | null)?.name ?? "—"}</Td>
                  <Td>
                    {r.revoked_at ? (
                      <Badge tone="red">Revoked</Badge>
                    ) : expired ? (
                      <Badge tone="red">Expired</Badge>
                    ) : (
                      <Badge tone={REQUEST_STATUS_TONE[r.status as keyof typeof REQUEST_STATUS_TONE]}>{humanize(r.status)}</Badge>
                    )}
                  </Td>
                  <Td>{formatDate(r.sent_at)}</Td>
                  <Td>{formatDate(r.opened_at)}</Td>
                  <Td>{formatDate(r.submitted_at)}</Td>
                  <Td>{formatDate(r.expires_at)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
