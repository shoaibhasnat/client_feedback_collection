import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { PROJECT_PLATFORMS, PROJECT_STATUSES, labelOf } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/admin/projects">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const { supabase, readOnly } = await requireOwner();

  let query = supabase
    .from("projects")
    .select("id, name, service_type, platform, status, end_date, clients(id, name), requests(count)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (q) {
    const safe = q.replace(/[%,()*]/g, " ");
    query = query.or(`name.ilike.%${safe}%,service_type.ilike.%${safe}%`);
  }
  if (status) query = query.eq("status", status);
  const { data: projects } = await query;

  return (
    <>
      <PageHeader title="Projects" actions={!readOnly && <LinkButton href="/admin/projects/new">Add project</LinkButton>} />
      <form className="mb-4 flex max-w-xl gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search projects" aria-label="Search projects" />
        <Select name="status" defaultValue={status} aria-label="Status" className="w-44">
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Button variant="outline">Apply</Button>
      </form>

      {!projects?.length ? (
        <EmptyState title={q || status ? "No projects match." : "No projects yet."} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Project</Th>
              <Th>Client</Th>
              <Th>Platform</Th>
              <Th>Status</Th>
              <Th>End date</Th>
              <Th className="text-right">Requests</Th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const client = p.clients as unknown as { id: string; name: string };
              const requests = (p.requests as unknown as { count: number }[])[0]?.count ?? 0;
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/admin/projects/${p.id}`} className="font-medium text-slate-900 hover:underline">
                      {p.name}
                    </Link>
                    {p.service_type && <p className="text-xs text-slate-500">{p.service_type}</p>}
                  </Td>
                  <Td>
                    <Link href={`/admin/clients/${client.id}`} className="hover:underline">
                      {client.name}
                    </Link>
                  </Td>
                  <Td>{labelOf(PROJECT_PLATFORMS, p.platform)}</Td>
                  <Td>
                    <Badge>{labelOf(PROJECT_STATUSES, p.status)}</Badge>
                  </Td>
                  <Td>{formatDate(p.end_date)}</Td>
                  <Td className="text-right tabular-nums">{requests}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
