import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Dl, LinkButton, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOwner } from "@/lib/auth";
import { CLIENT_SOURCES, CLIENT_STATUSES, PROJECT_STATUSES, REQUEST_STATUS_TONE, labelOf } from "@/lib/constants";
import { signPaths } from "@/lib/uploads";
import { formatDate, humanize, one } from "@/lib/utils";
import { deleteClientAction, deleteNoteAction } from "../actions";
import { NoteForm } from "./note-form";

export default async function ClientDetailPage({ params }: PageProps<"/admin/clients/[id]">) {
  const { id } = await params;
  const { supabase, readOnly } = await requireOwner();

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) notFound();

  const [{ data: projects }, { data: requests }, { data: testimonials }, { data: notes }, { data: activity }, referrer] =
    await Promise.all([
      supabase.from("projects").select("id, name, status, end_date, service_type").eq("client_id", id).order("created_at", { ascending: false }),
      supabase
        .from("requests")
        .select("id, status, created_at, submitted_at, projects(name), submissions(id, merge_status, submitted_at)")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("testimonials").select("id, display_quote, visibility, rating, submission_id, source").eq("client_id", id),
      supabase.from("client_notes").select("id, body, created_at").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("activity_log").select("id, entity_type, action, created_at, meta").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
      client.referred_by_client_id
        ? supabase.from("clients").select("id, name").eq("id", client.referred_by_client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const sign = await signPaths(supabase, [client.photo_url, client.logo_url]);
  const photo = sign(client.photo_url);
  const pendingMerges = (requests ?? []).flatMap((r) => {
    const s = one(r.submissions as unknown as { id: string; merge_status: string; submitted_at: string | null } | null);
    return s && s.submitted_at && s.merge_status === "pending" ? [s.id] : [];
  });

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-10 rounded-full object-cover" />
            )}
            {client.name}
          </span>
        }
        description={[client.job_title, client.company].filter(Boolean).join(" · ")}
        back={{ href: "/admin/clients", label: "Clients" }}
        actions={
          !readOnly && (
            <>
              <LinkButton href={`/admin/clients/${id}/edit`} variant="outline">
                Edit
              </LinkButton>
              <LinkButton href={`/admin/projects/new?client=${id}`} variant="outline">
                Add project
              </LinkButton>
              <LinkButton href={`/admin/requests/new?client=${id}`}>New request</LinkButton>
            </>
          )
        }
      />

      {pendingMerges.length > 0 && (
        <div className="mb-6 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          This client submitted updated details.{" "}
          <Link href={`/admin/testimonials/review/${pendingMerges[0]}#merge`} className="font-medium underline">
            Review and merge
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Profile" />
            <div className="p-5">
              <Dl
                items={[
                  ["Status", labelOf(CLIENT_STATUSES, client.status)],
                  ["Source", labelOf(CLIENT_SOURCES, client.source)],
                  ...(client.source === "referral"
                    ? ([["Referred by", referrer.data ? <Link key="r" className="underline" href={`/admin/clients/${referrer.data.id}`}>{referrer.data.name}</Link> : "—"]] as [string, React.ReactNode][])
                    : []),
                  ["Emails", (client.emails as string[]).join(", ")],
                  ["Phone", client.phone],
                  ["WhatsApp", client.whatsapp],
                  ["Preferred contact", client.preferred_contact],
                  ["LinkedIn", client.linkedin_url && <a key="l" className="underline" href={client.linkedin_url} target="_blank" rel="noreferrer">{client.linkedin_url}</a>],
                  ["Website", client.website && <a key="w" className="underline" href={client.website} target="_blank" rel="noreferrer">{client.website}</a>],
                  ["Upwork", client.upwork_url && <a key="u" className="underline" href={client.upwork_url} target="_blank" rel="noreferrer">Profile / contract</a>],
                  ["Other links", (client.socials as string[]).join(", ")],
                  ["Location", [client.city, client.country].filter(Boolean).join(", ")],
                  ["Time zone", client.timezone],
                  ["First project", formatDate(client.first_project_date)],
                  ["Last project", formatDate(client.last_project_date)],
                  ["Follow-up", formatDate(client.follow_up_date)],
                  ["Birthday / anniversary", formatDate(client.birthday)],
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Projects" />
            <ul className="divide-y divide-slate-100">
              {(projects ?? []).map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/projects/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                    <span>
                      <span className="font-medium text-slate-900">{p.name}</span>
                      {p.service_type && <span className="text-slate-500"> · {p.service_type}</span>}
                    </span>
                    <span className="flex items-center gap-3 text-xs text-slate-500">
                      {formatDate(p.end_date)}
                      <Badge>{labelOf(PROJECT_STATUSES, p.status)}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
              {!projects?.length && <li className="px-5 py-4 text-sm text-slate-500">No projects yet.</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Requests and submissions" />
            <ul className="divide-y divide-slate-100">
              {(requests ?? []).map((r) => {
                const sub = one(r.submissions as unknown as { id: string; submitted_at: string | null } | null);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <Link href={`/admin/requests/${r.id}`} className="hover:underline">
                      {(r.projects as unknown as { name: string } | null)?.name ?? "No project"}
                      <span className="text-slate-500"> · created {formatDate(r.created_at)}</span>
                    </Link>
                    <span className="flex items-center gap-3">
                      {sub?.submitted_at && (
                        <Link href={`/admin/testimonials/review/${sub.id}`} className="text-xs font-medium underline">
                          View submission
                        </Link>
                      )}
                      <Badge tone={REQUEST_STATUS_TONE[r.status as keyof typeof REQUEST_STATUS_TONE]}>{humanize(r.status)}</Badge>
                    </span>
                  </li>
                );
              })}
              {!requests?.length && <li className="px-5 py-4 text-sm text-slate-500">No requests yet.</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Testimonials" />
            <ul className="divide-y divide-slate-100">
              {(testimonials ?? []).map((t) => (
                <li key={t.id} className="px-5 py-3 text-sm">
                  <Link href={`/admin/testimonials/${t.id}`} className="block hover:underline">
                    <p className="line-clamp-2 text-slate-800">{t.display_quote || <em className="text-slate-400">No display quote yet</em>}</p>
                  </Link>
                  <p className="mt-1 flex gap-2 text-xs text-slate-500">
                    <Badge tone={t.visibility === "published" ? "green" : "slate"}>{t.visibility}</Badge>
                    {t.rating && <span>{"★".repeat(t.rating)}</span>}
                  </p>
                </li>
              ))}
              {!testimonials?.length && <li className="px-5 py-4 text-sm text-slate-500">No testimonials yet.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Private notes" />
            {!readOnly && (
              <div className="border-b border-slate-100 p-4">
                <NoteForm clientId={id} />
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {(notes ?? []).map((n) => (
                <li key={n.id} className="px-4 py-3 text-sm">
                  <p className="whitespace-pre-wrap text-slate-800">{n.body}</p>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatDate(n.created_at, true)}</span>
                    {!readOnly && (
                      <form action={deleteNoteAction.bind(null, id, n.id)}>
                        <button className="hover:text-red-600">Delete</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
              {!notes?.length && <li className="px-4 py-3 text-sm text-slate-500">No notes yet.</li>}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <ol className="space-y-3 p-4 text-sm">
              {(activity ?? []).map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="text-slate-700">
                    {humanize(a.entity_type)} {a.action.replace(/_/g, " ")}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(a.created_at, true)}</span>
                </li>
              ))}
              {!activity?.length && <li className="text-slate-500">Nothing yet.</li>}
            </ol>
          </Card>

          {!readOnly && (
            <Card className="border-red-200">
              <CardHeader title="Delete client" description="Removes this client, their projects, requests, submissions, testimonials, notes and files. This can't be undone." />
              <div className="p-4">
                <form action={deleteClientAction.bind(null, id)}>
                  <ConfirmSubmit message={`Delete ${client.name} and ALL their data permanently?`}>Delete client and data</ConfirmSubmit>
                </form>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
