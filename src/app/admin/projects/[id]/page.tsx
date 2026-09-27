import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, Dl, LinkButton, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOwner } from "@/lib/auth";
import { PROJECT_PLATFORMS, PROJECT_STATUSES, REQUEST_STATUS_TONE, labelOf } from "@/lib/constants";
import { signPaths } from "@/lib/uploads";
import { formatDate, humanize } from "@/lib/utils";
import { deleteAttachmentAction, deleteProjectAction } from "../actions";
import { AttachmentForm } from "./attachment-form";

export default async function ProjectDetailPage({ params }: PageProps<"/admin/projects/[id]">) {
  const { id } = await params;
  const { supabase, readOnly } = await requireOwner();
  const { data: project } = await supabase.from("projects").select("*, clients(id, name)").eq("id", id).maybeSingle();
  if (!project) notFound();

  const [{ data: requests }, { data: attachments }] = await Promise.all([
    supabase.from("requests").select("id, status, created_at, submitted_at").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("attachments").select("id, file_url, file_name, mime_type, created_at").eq("owner_type", "project").eq("owner_id", id),
  ]);
  const sign = await signPaths(supabase, (attachments ?? []).map((a) => a.file_url));
  const client = project.clients as unknown as { id: string; name: string };
  const links = (project.links ?? []) as { label: string; url: string }[];
  const money =
    project.budget !== null
      ? new Intl.NumberFormat("en", { style: "currency", currency: project.currency || "USD" }).format(project.budget)
      : "—";

  return (
    <>
      <PageHeader
        title={project.name}
        description={
          <>
            for{" "}
            <Link href={`/admin/clients/${client.id}`} className="underline">
              {client.name}
            </Link>
          </>
        }
        back={{ href: "/admin/projects", label: "Projects" }}
        actions={
          !readOnly && (
            <>
              <LinkButton href={`/admin/projects/${id}/edit`} variant="outline">
                Edit
              </LinkButton>
              <LinkButton href={`/admin/requests/new?client=${client.id}&project=${id}`}>Request testimonial</LinkButton>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <div className="space-y-5 p-5">
              <Dl
                items={[
                  ["Status", labelOf(PROJECT_STATUSES, project.status)],
                  ["Platform", labelOf(PROJECT_PLATFORMS, project.platform)],
                  ["Service type", project.service_type],
                  ["Budget (private)", money],
                  ["Start", formatDate(project.start_date)],
                  ["End", formatDate(project.end_date)],
                ]}
              />
              {project.description && <Section title="Description">{project.description}</Section>}
              {project.outcomes && <Section title="Results / outcomes">{project.outcomes}</Section>}
              {project.notes && <Section title="Private notes">{project.notes}</Section>}
              {links.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Links</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                          {l.label || l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Requests" />
            <ul className="divide-y divide-slate-100">
              {(requests ?? []).map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/requests/${r.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50">
                    <span>Created {formatDate(r.created_at)}</span>
                    <Badge tone={REQUEST_STATUS_TONE[r.status as keyof typeof REQUEST_STATUS_TONE]}>{humanize(r.status)}</Badge>
                  </Link>
                </li>
              ))}
              {!requests?.length && <li className="px-5 py-4 text-sm text-slate-500">No requests for this project yet.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Attachments" description="Screenshots and files. Private." />
            <ul className="divide-y divide-slate-100">
              {(attachments ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <a href={sign(a.file_url) ?? "#"} target="_blank" rel="noreferrer" className="truncate underline">
                    {a.file_name}
                  </a>
                  {!readOnly && (
                    <form action={deleteAttachmentAction.bind(null, id, a.id)}>
                      <button className="text-xs text-slate-500 hover:text-red-600">Remove</button>
                    </form>
                  )}
                </li>
              ))}
              {!attachments?.length && <li className="px-4 py-3 text-sm text-slate-500">None yet.</li>}
            </ul>
            {!readOnly && (
              <div className="border-t border-slate-100 p-4">
                <AttachmentForm projectId={id} />
              </div>
            )}
          </Card>

          {!readOnly && (
            <Card>
              <CardHeader title="Delete project" description="Requests keep existing but lose the project link." />
              <div className="p-4">
                <form action={deleteProjectAction.bind(null, id)}>
                  <ConfirmSubmit message="Delete this project and its attachments?">Delete project</ConfirmSubmit>
                </form>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{children}</p>
    </div>
  );
}
