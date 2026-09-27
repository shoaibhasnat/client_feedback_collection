import { requireSuperAdmin } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Dl, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { listWorkspaces, formatBytes } from "@/lib/superadmin";
import { formatDate } from "@/lib/utils";
import { revokeInvite, setWorkspaceStatus } from "../../actions";
import { EditWorkspaceForm, InviteLinkForm } from "./forms";

export default async function WorkspaceDetailPage({ params }: PageProps<"/superadmin/workspaces/[id]">) {
  await requireSuperAdmin();
  const { id } = await params;
  const ws = (await listWorkspaces()).find((w) => w.id === id);
  if (!ws) notFound();

  const admin = createAdminClient();
  const { data: invites } = await admin
    .from("invites")
    .select("id, email, status, expires_at, accepted_at, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title={ws.name}
        description={`/${ws.slug}`}
        back={{ href: "/superadmin", label: "Workspaces" }}
        actions={
          <form action={setWorkspaceStatus.bind(null, ws.id, ws.status === "active" ? "suspended" : "active")}>
            {ws.status === "active" ? (
              <ConfirmSubmit message="Suspend this workspace? The owner gets read-only access and request links stop working.">
                Suspend workspace
              </ConfirmSubmit>
            ) : (
              <ConfirmSubmit variant="primary" message="Reactivate this workspace?">
                Reactivate
              </ConfirmSubmit>
            )}
          </form>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Overview" description="Counts only. Business data is never shown here." />
          <div className="p-5">
            <Dl
              items={[
                ["Status", <Badge key="s" tone={ws.status === "active" ? "green" : "amber"}>{ws.status}</Badge>],
                ["Owner", ws.owner ? `${ws.owner.name ?? ""} <${ws.owner.email}>` : "Not accepted yet"],
                ["Clients", ws.stats.clients],
                ["Testimonials", ws.stats.testimonials],
                ["Requests", ws.stats.requests],
                ["Videos", ws.stats.videos],
                ["Storage used", formatBytes(ws.stats.storage_bytes)],
                ["Last activity", formatDate(ws.stats.last_activity_at, true)],
                ["Created", formatDate(ws.created_at, true)],
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Name and slug" description="The owner sees the slug read-only." />
          <div className="p-5">
            <EditWorkspaceForm workspaceId={ws.id} name={ws.name} slug={ws.slug} />
          </div>
        </Card>

        {!ws.owner && (
          <Card className="lg:col-span-2">
            <CardHeader
              title="Owner invite"
              description="Making a new link revokes any earlier pending link for this workspace."
            />
            <div className="p-5">
              <InviteLinkForm workspaceId={ws.id} defaultEmail={ws.pendingInvite?.email ?? ""} />
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader title="Invite history" />
          <ul className="divide-y divide-slate-100">
            {(invites ?? []).map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="text-slate-900">{inv.email}</p>
                  <p className="text-xs text-slate-500">
                    Created {formatDate(inv.created_at, true)} · expires {formatDate(inv.expires_at, true)}
                    {inv.accepted_at && ` · accepted ${formatDate(inv.accepted_at, true)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={inv.status === "accepted" ? "green" : inv.status === "pending" ? "blue" : "slate"}>
                    {inv.status === "pending" && new Date(inv.expires_at) < new Date() ? "expired" : inv.status}
                  </Badge>
                  {inv.status === "pending" && (
                    <form action={revokeInvite.bind(null, inv.id)}>
                      <ConfirmSubmit variant="outline" message="Revoke this invite link?">
                        Revoke
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </li>
            ))}
            {!invites?.length && <li className="px-5 py-4 text-sm text-slate-500">No invites.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
