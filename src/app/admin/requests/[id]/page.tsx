import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, Card, CardHeader, Input, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOwner } from "@/lib/auth";
import { REQUEST_STATUS_TONE } from "@/lib/constants";
import { buildMessage, requestUrl } from "@/lib/requests";
import { buildSteps, estimateMinutes } from "@/lib/form/steps";
import type { TemplateSnapshot } from "@/lib/form/types";
import { formatDate, humanize, one } from "@/lib/utils";
import {
  deleteRequestAction,
  duplicateRequestAction,
  markRemindedAction,
  reopenRequestAction,
  revokeRequestAction,
  updateExpiryAction,
} from "../actions";
import { ShareBox } from "./share-box";

export default async function RequestDetailPage({ params, searchParams }: PageProps<"/admin/requests/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, workspace, readOnly } = await requireOwner();

  const [{ data: req }, { data: settings }] = await Promise.all([
    supabase
      .from("requests")
      .select("*, clients(id, name), projects(id, name), submissions(id, submitted_at, progress_step)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("site_settings").select("profile, message_templates").eq("workspace_id", workspace.id).single(),
  ]);
  if (!req) notFound();

  const client = req.clients as unknown as { id: string; name: string };
  const project = req.projects as unknown as { id: string; name: string } | null;
  const submission = one(req.submissions as unknown as { id: string; submitted_at: string | null; progress_step: number } | null);
  const snapshot = req.template_snapshot as TemplateSnapshot;
  const link = requestUrl(req.token);
  const templates = (settings?.message_templates ?? {}) as Record<string, unknown>;
  const ownerName = ((settings?.profile ?? {}) as Record<string, string>).name ?? "";
  const vars = { clientName: client.name, projectName: project?.name ?? null, link, ownerName };
  const messages = {
    upwork: buildMessage(templates, "upwork", vars),
    email: buildMessage(templates, "email", vars),
    whatsapp: buildMessage(templates, "whatsapp", vars),
    reminder: buildMessage(templates, "reminder", vars),
  };

  const expired = req.expires_at && new Date(req.expires_at) < new Date() && !req.submitted_at;
  const steps = buildSteps(snapshot);
  const timeline: [string, string | null][] = [
    ["Created", req.created_at],
    ["Sent", req.sent_at],
    ["Opened", req.opened_at],
    ["Started", req.started_at],
    ["Submitted", req.submitted_at],
    ["Reviewed", req.reviewed_at],
    ["Reminded", req.last_reminded_at],
    ["Revoked", req.revoked_at],
  ];

  return (
    <>
      <PageHeader
        title={`Request for ${client.name}`}
        description={
          <>
            <Link href={`/admin/clients/${client.id}`} className="underline">
              {client.name}
            </Link>
            {project && (
              <>
                {" · "}
                <Link href={`/admin/projects/${project.id}`} className="underline">
                  {project.name}
                </Link>
              </>
            )}
            {" · "}template “{snapshot.template.name}”
          </>
        }
        back={{ href: "/admin/requests", label: "Requests" }}
        actions={
          req.revoked_at ? (
            <Badge tone="red">Revoked</Badge>
          ) : expired ? (
            <Badge tone="red">Expired</Badge>
          ) : (
            <Badge tone={REQUEST_STATUS_TONE[req.status as keyof typeof REQUEST_STATUS_TONE]}>{humanize(req.status)}</Badge>
          )
        }
      />

      {sp.created === "1" && (
        <Alert tone="green" className="mb-6">
          Link created. Copy it or a ready-made message below. Copying marks the request as sent.
        </Alert>
      )}
      {submission?.submitted_at && (
        <Alert tone="blue" className="mb-6">
          Submitted {formatDate(submission.submitted_at, true)}.{" "}
          <Link href={`/admin/testimonials/review/${submission.id}`} className="font-medium underline">
            Review the submission
          </Link>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ShareBox
            requestId={req.id}
            link={link}
            messages={messages}
            disabled={Boolean(req.revoked_at) || readOnly}
            isDraft={req.status === "draft"}
            canRemind={!req.submitted_at && !req.revoked_at && req.status !== "draft"}
          />

          <Card>
            <CardHeader
              title="Form snapshot"
              description={`${steps.length + 1} screens · about ${estimateMinutes(snapshot)} min. Frozen when the request was created, so later template edits don't affect it.`}
            />
            <ol className="list-decimal space-y-1 px-10 py-4 text-sm text-slate-700">
              {snapshot.items
                .filter((i) => i.shown && i.section === "question")
                .map((i) => (
                  <li key={i.key}>
                    {i.label}
                    {!i.required && <span className="text-slate-400"> (optional)</span>}
                  </li>
                ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Timeline" />
            <dl className="space-y-2 p-5 text-sm">
              {timeline.map(([label, at]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className={at ? "text-slate-900" : "text-slate-300"}>{formatDate(at, true)}</dd>
                </div>
              ))}
              {submission && !submission.submitted_at && (
                <p className="pt-2 text-xs text-slate-500">Client is on screen {submission.progress_step + 1} of {steps.length}.</p>
              )}
            </dl>
          </Card>

          {!readOnly && (
            <Card>
              <CardHeader title="Actions" />
              <div className="space-y-4 p-5">
                <form action={updateExpiryAction.bind(null, req.id)} className="flex items-end gap-2">
                  <label className="flex-1 text-sm">
                    <span className="mb-1 block text-slate-600">Expiry date</span>
                    <Input name="expires_at" type="date" defaultValue={req.expires_at?.slice(0, 10) ?? ""} />
                  </label>
                  <Button variant="outline" size="md">
                    Save
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {!req.submitted_at && !req.revoked_at && req.status !== "draft" && (
                    <form action={markRemindedAction.bind(null, req.id)}>
                      <Button variant="outline" size="sm">
                        Mark reminded today
                      </Button>
                    </form>
                  )}
                  {(req.submitted_at || req.revoked_at) && (
                    <form action={reopenRequestAction.bind(null, req.id)}>
                      <ConfirmSubmit variant="outline" message="Reopen this link so the client can use it again?">
                        Reopen link
                      </ConfirmSubmit>
                    </form>
                  )}
                  {!req.revoked_at && (
                    <form action={revokeRequestAction.bind(null, req.id)}>
                      <ConfirmSubmit variant="outline" message="Revoke this link? It stops working immediately.">
                        Revoke link
                      </ConfirmSubmit>
                    </form>
                  )}
                  <form action={duplicateRequestAction.bind(null, req.id)}>
                    <Button variant="outline" size="sm">
                      Duplicate
                    </Button>
                  </form>
                  {["draft", "sent", "opened"].includes(req.status) && (
                    <form action={deleteRequestAction.bind(null, req.id)}>
                      <ConfirmSubmit message="Delete this request? The link stops working.">Delete</ConfirmSubmit>
                    </form>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
