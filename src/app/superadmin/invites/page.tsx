import Link from "next/link";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { revokeInvite } from "../actions";

export default async function InvitesPage() {
  const admin = createAdminClient();
  const { data: invites } = await admin
    .from("invites")
    .select("id, email, status, expires_at, accepted_at, created_at, workspaces(id, name)")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <>
      <PageHeader title="Invites" description="Links are single-use. Only a hash of each link is stored." />
      {!invites?.length ? (
        <EmptyState title="No invites yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Email</Th>
              <Th>Workspace</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th>Expires</Th>
              <Th>Accepted</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => {
              const ws = inv.workspaces as unknown as { id: string; name: string } | null;
              const status = inv.status === "pending" && new Date(inv.expires_at) < new Date() ? "expired" : inv.status;
              return (
                <tr key={inv.id}>
                  <Td>{inv.email}</Td>
                  <Td>
                    {ws && (
                      <Link href={`/superadmin/workspaces/${ws.id}`} className="hover:underline">
                        {ws.name}
                      </Link>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={status === "accepted" ? "green" : status === "pending" ? "blue" : "slate"}>{status}</Badge>
                  </Td>
                  <Td>{formatDate(inv.created_at, true)}</Td>
                  <Td>{formatDate(inv.expires_at, true)}</Td>
                  <Td>{formatDate(inv.accepted_at, true)}</Td>
                  <Td className="text-right">
                    {status === "pending" && (
                      <form action={revokeInvite.bind(null, inv.id)}>
                        <ConfirmSubmit variant="outline" message="Revoke this invite link?">
                          Revoke
                        </ConfirmSubmit>
                      </form>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
