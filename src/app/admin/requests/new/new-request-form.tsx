"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Alert, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import {
  createRequestAction,
  previewRequestAction,
  type CreateRequestState,
  type PreviewResult,
} from "../actions";

export function NewRequestForm({
  clients,
  projects,
  templates,
  initialClient,
  initialProject,
}: {
  clients: { id: string; name: string; status: string }[];
  projects: { id: string; name: string; client_id: string }[];
  templates: { id: string; name: string; is_default: boolean }[];
  initialClient: string;
  initialProject: string;
}) {
  const [state, action] = useActionState<CreateRequestState, FormData>(createRequestAction, {});
  const [clientId, setClientId] = useState(initialClient);
  const [projectId, setProjectId] = useState(initialProject);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, startTransition] = useTransition();

  const clientProjects = projects.filter((p) => p.client_id === clientId);
  const client = clients.find((c) => c.id === clientId);

  const [minExpiry] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

  useEffect(() => {
    if (!clientId) return;
    startTransition(async () => {
      setPreview(await previewRequestAction({ clientId, projectId: projectId || null, templateId: templateId || null }));
    });
  }, [clientId, projectId, templateId]);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        {state.error && <Alert tone="red">{state.error}</Alert>}
        <Card>
          <CardHeader title="Who and what" />
          <div className="grid gap-4 p-5">
            <Field label="Client" htmlFor="client_id">
              <Select
                id="client_id"
                name="client_id"
                value={clientId}
                required
                onChange={(e) => {
                  setClientId(e.target.value);
                  setProjectId("");
                }}
              >
                <option value="" disabled>
                  Choose a client…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {client?.status === "do_not_contact" && (
              <Alert tone="amber">This client is marked “Do not contact”.</Alert>
            )}
            <Field label="Project" htmlFor="project_id" hint={clientId && !clientProjects.length ? "This client has no projects yet. The form will say “our project”." : undefined}>
              <Select id="project_id" name="project_id" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!clientId}>
                <option value="">No specific project</option>
                {clientProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Form template" htmlFor="template_id">
              <Select id="template_id" name="template_id" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_default ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Optional" />
          <div className="grid gap-4 p-5">
            <Field label="Personal message" htmlFor="personal_message" hint="Shown on the form's welcome screen.">
              <Textarea id="personal_message" name="personal_message" rows={3} maxLength={1000} />
            </Field>
            <Field label="Link expires on" htmlFor="expires_at" hint="Leave empty to keep the link open until it's submitted.">
              <Input id="expires_at" name="expires_at" type="date" min={minExpiry} />
            </Field>
          </div>
        </Card>

        <Alert tone="blue">
          For Upwork clients: frame the link as feedback only, ideally after the contract ends. Upwork restricts moving
          communication off-platform.
        </Alert>

        <SubmitButton pendingText="Creating link…" size="lg">
          Create request link
        </SubmitButton>
      </div>

      <div className="lg:col-span-2">
        <Card className="lg:sticky lg:top-6">
          <CardHeader title="What the client will see" description={loading ? "Updating…" : undefined} />
          <div className="p-5 text-sm">
            {!clientId && <p className="text-slate-500">Choose a client to preview the form.</p>}
            {clientId && preview?.error && <p className="text-red-600">{preview.error}</p>}
            {clientId && preview?.screens && (
              <>
                <p className="mb-3 text-slate-700">
                  <strong>{preview.screens.length} screens</strong> · about {preview.minutes} min
                </p>
                <ol className="list-decimal space-y-1 pl-5 text-slate-700">
                  {preview.screens.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                {!!preview.warnings?.length && (
                  <div className="mt-4 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-medium">Missing prefill values</p>
                    {preview.warnings.map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>
    </form>
  );
}
