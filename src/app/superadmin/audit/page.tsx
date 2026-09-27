import { requireSuperAdmin } from "@/lib/auth";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

export default async function AuditPage() {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("audit_log")
    .select("id, action, target_type, target_id, meta, ip_hash, created_at, profiles(email), workspaces(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <>
      <PageHeader title="Audit log" description="Super admin actions and every sign-in. Latest 300 entries." />
      {!rows?.length ? (
        <EmptyState title="Nothing logged yet." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Workspace</Th>
              <Th>Target</Th>
              <Th>IP hash</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDate(r.created_at, true)}</Td>
                <Td>{(r.profiles as unknown as { email: string } | null)?.email ?? "—"}</Td>
                <Td>
                  <code className="text-xs">{r.action}</code>
                </Td>
                <Td>{(r.workspaces as unknown as { name: string } | null)?.name ?? "—"}</Td>
                <Td className="text-xs text-slate-500">
                  {r.target_type ? `${r.target_type}:${String(r.target_id ?? "").slice(0, 8)}` : "—"}
                </Td>
                <Td className="font-mono text-xs text-slate-500">{r.ip_hash?.slice(0, 10) ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
