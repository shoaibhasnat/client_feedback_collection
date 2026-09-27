import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, EmptyState, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { CLIENT_SOURCES, CLIENT_STATUSES, labelOf } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Clients" };

const SORTS = {
  name: { column: "name", ascending: true, label: "Name" },
  last_project: { column: "last_project_date", ascending: false, label: "Last project date" },
  follow_up: { column: "follow_up_date", ascending: true, label: "Follow-up date" },
  recent: { column: "created_at", ascending: false, label: "Recently added" },
} as const;

export default async function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q").trim();
  const source = str("source");
  const status = str("status");
  const has = str("has");
  const sortKey = (str("sort") in SORTS ? str("sort") : "recent") as keyof typeof SORTS;
  const sort = SORTS[sortKey];

  const { supabase, readOnly } = await requireOwner();
  let query = supabase
    .from("clients")
    .select("id, name, company, job_title, source, status, last_project_date, follow_up_date, testimonials(count), projects(count)")
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .limit(500);
  if (q) {
    const safe = q.replace(/[%,()*]/g, " ");
    query = query.or(`name.ilike.%${safe}%,company.ilike.%${safe}%,job_title.ilike.%${safe}%`);
  }
  if (source) query = query.eq("source", source);
  if (status) query = query.eq("status", status);
  const { data } = await query;

  const count = (rel: unknown) => (Array.isArray(rel) ? ((rel[0] as { count?: number })?.count ?? 0) : 0);
  const clients = (data ?? []).filter((c) => {
    if (has === "yes") return count(c.testimonials) > 0;
    if (has === "no") return count(c.testimonials) === 0;
    return true;
  });
  const filtered = Boolean(q || source || status || has);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone you've worked with, whether or not they've left a testimonial."
        actions={!readOnly && <LinkButton href="/admin/clients/new">Add client</LinkButton>}
      />
      {sp.deleted === "1" && (
        <Alert tone="green" className="mb-4">
          Client and all their data deleted.
        </Alert>
      )}

      <form className="mb-4 grid gap-2 sm:grid-cols-6" role="search">
        <Input name="q" defaultValue={q} placeholder="Search name, company, title" aria-label="Search clients" className="sm:col-span-2" />
        <Select name="source" defaultValue={source} aria-label="Source">
          <option value="">All sources</option>
          {CLIENT_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status">
          <option value="">All statuses</option>
          {CLIENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="has" defaultValue={has} aria-label="Has testimonial">
          <option value="">Any testimonial</option>
          <option value="yes">Has testimonial</option>
          <option value="no">No testimonial</option>
        </Select>
        <div className="flex gap-2">
          <Select name="sort" defaultValue={sortKey} aria-label="Sort by">
            {Object.entries(SORTS).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </div>
      </form>

      {clients.length === 0 ? (
        <EmptyState title={filtered ? "No clients match these filters." : "No clients yet."}>
          {!filtered && !readOnly && (
            <Link href="/admin/clients/new" className="font-medium text-slate-900 underline">
              Add your first client
            </Link>
          )}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Client</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th className="text-right">Projects</Th>
              <Th className="text-right">Testimonials</Th>
              <Th>Last project</Th>
              <Th>Follow-up</Th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const due = c.follow_up_date && c.follow_up_date <= new Date().toISOString().slice(0, 10);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/admin/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-slate-500">{[c.job_title, c.company].filter(Boolean).join(" · ") || "—"}</p>
                  </Td>
                  <Td>{labelOf(CLIENT_SOURCES, c.source)}</Td>
                  <Td>
                    <Badge tone={c.status === "active" ? "green" : c.status === "do_not_contact" ? "red" : "slate"}>
                      {labelOf(CLIENT_STATUSES, c.status)}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{count(c.projects)}</Td>
                  <Td className="text-right tabular-nums">{count(c.testimonials)}</Td>
                  <Td>{formatDate(c.last_project_date)}</Td>
                  <Td className={due ? "font-medium text-amber-700" : undefined}>{formatDate(c.follow_up_date)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
