import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { listWorkspaces, formatBytes } from "@/lib/superadmin";
import { formatDate } from "@/lib/utils";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function WorkspacesPage({ searchParams }: PageProps<"/superadmin">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const workspaces = await listWorkspaces(q || undefined);

  return (
    <>
      <PageHeader title="Workspaces" description="Each business works in its own isolated workspace." />

      <Card className="mb-8">
        <CardHeader
          title="Create a workspace"
          description="This makes a single-use invite link for the owner. Send it yourself; the app doesn't send invite emails."
        />
        <div className="p-5">
          <CreateWorkspaceForm />
        </div>
      </Card>

      <form className="mb-4 flex max-w-sm gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search name or slug" aria-label="Search workspaces" />
      </form>

      {workspaces.length === 0 ? (
        <EmptyState title={q ? "No workspaces match." : "No workspaces yet."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Workspace</Th>
              <Th>Owner</Th>
              <Th>Status</Th>
              <Th className="text-right">Clients</Th>
              <Th className="text-right">Testimonials</Th>
              <Th className="text-right">Requests</Th>
              <Th className="text-right">Videos</Th>
              <Th className="text-right">Storage</Th>
              <Th>Last activity</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((w) => (
              <tr key={w.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/superadmin/workspaces/${w.id}`} className="font-medium text-slate-900 hover:underline">
                    {w.name}
                  </Link>
                  <p className="text-xs text-slate-500">/{w.slug}</p>
                </Td>
                <Td>
                  {w.owner ? (
                    <>
                      <p>{w.owner.name ?? "—"}</p>
                      <p className="text-xs text-slate-500">{w.owner.email}</p>
                    </>
                  ) : w.pendingInvite ? (
                    <span className="text-xs text-slate-500">Invited: {w.pendingInvite.email}</span>
                  ) : (
                    <span className="text-xs text-amber-700">No owner, no active invite</span>
                  )}
                </Td>
                <Td>
                  <Badge tone={w.status === "active" ? "green" : "amber"}>{w.status}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{w.stats.clients}</Td>
                <Td className="text-right tabular-nums">{w.stats.testimonials}</Td>
                <Td className="text-right tabular-nums">{w.stats.requests}</Td>
                <Td className="text-right tabular-nums">{w.stats.videos}</Td>
                <Td className="text-right tabular-nums">{formatBytes(w.stats.storage_bytes)}</Td>
                <Td>{formatDate(w.stats.last_activity_at)}</Td>
                <Td>{formatDate(w.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
