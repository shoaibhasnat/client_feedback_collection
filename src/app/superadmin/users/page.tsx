import { requireSuperAdmin } from "@/lib/auth";
import Link from "next/link";
import { Badge, PageHeader, Table, Td, Th } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";
import { forcePasswordReset, setUserStatus } from "../actions";

export default async function UsersPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const [{ data: profiles }, { data: authUsers }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, name, email, is_super_admin, status, last_sign_in_at, workspace_members(workspaces(id, name))")
      .order("created_at", { ascending: true }),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const mfa = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, (u.factors ?? []).some((f) => f.status === "verified")]),
  );

  return (
    <>
      <PageHeader title="Users" description="Owner accounts. Super admins are managed in the database only." />
      <Table>
        <thead>
          <tr>
            <Th>User</Th>
            <Th>Workspace</Th>
            <Th>Last sign-in</Th>
            <Th>2FA</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {(profiles ?? []).map((p) => {
            const ws = (p.workspace_members as unknown as { workspaces: { id: string; name: string } }[])[0]?.workspaces;
            return (
              <tr key={p.id}>
                <Td>
                  <p className="font-medium text-slate-900">{p.name ?? "—"}</p>
                  <p className="text-xs text-slate-500">{p.email}</p>
                </Td>
                <Td>
                  {p.is_super_admin ? (
                    <Badge tone="purple">Super admin</Badge>
                  ) : ws ? (
                    <Link href={`/superadmin/workspaces/${ws.id}`} className="hover:underline">
                      {ws.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{formatDate(p.last_sign_in_at, true)}</Td>
                <Td>{mfa.get(p.id) ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</Td>
                <Td>
                  <Badge tone={p.status === "active" ? "green" : "red"}>{p.status}</Badge>
                </Td>
                <Td className="text-right">
                  {!p.is_super_admin && (
                    <div className="flex justify-end gap-2">
                      <form action={forcePasswordReset.bind(null, p.id)}>
                        <ConfirmSubmit
                          variant="outline"
                          message="Reset this user's password? Their current password stops working and they get a reset email."
                        >
                          Force reset
                        </ConfirmSubmit>
                      </form>
                      <form action={setUserStatus.bind(null, p.id, p.status === "active" ? "disabled" : "active")}>
                        {p.status === "active" ? (
                          <ConfirmSubmit message="Disable this user? They won't be able to sign in.">Disable</ConfirmSubmit>
                        ) : (
                          <ConfirmSubmit variant="primary" message="Enable this user?">
                            Enable
                          </ConfirmSubmit>
                        )}
                      </form>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-slate-500">To invite an owner, create a workspace or open one without an owner.</p>
    </>
  );
}
