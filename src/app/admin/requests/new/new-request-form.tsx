"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { FormPreview } from "@/components/form-preview";
import { ItemSettingsGrid } from "@/components/item-settings-grid";
import { applyPreset } from "@/lib/form/settings";
import type { FormItemRow, ItemSettings } from "@/lib/form/types";
import { createRequestAction, previewRequestAction, type CreateRequestState, type CustomizeData } from "../actions";

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
  const [message, setMessage] = useState("");
  const [minExpiry] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));

  const [data, setData] = useState<CustomizeData | null>(null);
  const [settings, setSettings] = useState<Record<string, ItemSettings>>({});
  const [live, setLive] = useState<Pick<CustomizeData, "preview" | "prefillValues" | "warnings"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveDefaults, setSaveDefaults] = useState(false);
  const seq = useRef(0);

  const clientProjects = projects.filter((p) => p.client_id === clientId);
  const client = clients.find((c) => c.id === clientId);

  // Load baseline settings whenever the client, project or template changes.
  useEffect(() => {
    if (!clientId) return;
    const mine = ++seq.current;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await previewRequestAction({ clientId, projectId: projectId || null, templateId: templateId || null });
      if (cancelled || mine !== seq.current) return;
      setData(res);
      setSettings(res.baseline ?? {});
      setLive({ preview: res.preview, prefillValues: res.prefillValues, warnings: res.warnings });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, projectId, templateId]);

  // Re-resolve the preview (debounced) as the owner changes settings or the personal message.
  const settingsJson = JSON.stringify(settings);
  useEffect(() => {
    if (!clientId || !data?.baseline) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await previewRequestAction({
        clientId,
        projectId: projectId || null,
        templateId: templateId || null,
        settings: JSON.parse(settingsJson),
      });
      if (mine !== seq.current) return;
      if (!res.error) setLive({ preview: res.preview, prefillValues: res.prefillValues, warnings: res.warnings });
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
    // Only settings drive this effect; the loader above handles client/project/template changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsJson]);

  const rowsForPresets: FormItemRow[] = (data?.rows ?? []).map((r, i) => ({
    ...r,
    id: r.key,
    helper_text: null,
    placeholder: null,
    required: false,
    visibility: "public-eligible",
    default_shown: true,
    default_prefill: "none",
    default_prefill_value: null,
    default_prefill_locked: false,
    sort_order: i,
    archived_at: null,
  }));

  const preview = live?.preview;
  const changedCount = data?.baseline
    ? Object.keys(settings).filter((k) => JSON.stringify(settings[k]) !== JSON.stringify(data.baseline![k])).length
    : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      {/* The preview renders the real client form, so it must sit outside this <form>. */}
      <form action={action} className="min-w-0 space-y-6">
        <input type="hidden" name="settings" value={settingsJson} />
        {state.error && <Alert tone="red">{state.error}</Alert>}
        <Card>
          <CardHeader title="Who and what" />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
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
            <Field label="Project" htmlFor="project_id">
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
            {client?.status === "do_not_contact" && (
              <Alert tone="amber" className="sm:col-span-3">
                This client is marked “Do not contact”.
              </Alert>
            )}
          </div>
        </Card>

        {clientId && data?.error && <Alert tone="red">{data.error}</Alert>}

        {clientId && data?.baseline && (
          <Card>
            <CardHeader
              title="Customize form"
              description="Pre-set from the template and this client's saved preferences. Changes here apply to this request only."
              action={
                changedCount > 0 ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSettings(data.baseline!)}>
                    Reset ({changedCount})
                  </Button>
                ) : undefined
              }
            />
            <div className="space-y-4 p-5">
              {!!data.presets?.length && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-600">Quick presets:</span>
                  {data.presets.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSettings(applyPreset(p, rowsForPresets, data.baseline!))}
                    >
                      {p.name}
                    </Button>
                  ))}
                </div>
              )}
              <ItemSettingsGrid
                rows={data.rows ?? []}
                settings={settings}
                baseline={data.baseline}
                prefillValues={live?.prefillValues}
                choices={data.choices ?? { clientCustom: [], projectCustom: [] }}
                hasProject={Boolean(projectId)}
                onChange={(key, next) => setSettings((s) => ({ ...s, [key]: next }))}
              />
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="save_client_defaults"
                  checked={saveDefaults}
                  onChange={(e) => setSaveDefaults(e.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  Save as {client?.name ?? "this client"}&apos;s defaults
                  <span className="block text-xs text-slate-500">Future requests for this client start from these settings.</span>
                </span>
              </label>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Optional" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Personal message" htmlFor="personal_message" hint="Shown on the form's welcome screen." className="sm:col-span-2">
              <Textarea
                id="personal_message"
                name="personal_message"
                rows={3}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
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
      </form>

      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        {!clientId && (
          <Card className="p-5 text-sm text-slate-500">Choose a client to see exactly what they will get.</Card>
        )}
        {clientId && preview && (
          <>
            <Card className="p-4 text-sm">
              <p className="text-slate-700">
                <strong>{preview.screens.length} screens</strong> · about {preview.minutes} min{loading && " · updating…"}
              </p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-slate-600">
                {preview.screens.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {!!live?.warnings?.length && (
                <div className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-medium">Missing prefill values</p>
                  {live.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
            </Card>
            <FormPreview
              snapshot={preview.snapshot}
              theme={preview.theme}
              ownerPhotoUrl={preview.ownerPhotoUrl}
              shareUrl={preview.shareUrl}
              minutes={preview.minutes}
              personalMessage={message || null}
              title="Exactly what the client will see"
              note="Built from the same snapshot this request will store."
            />
          </>
        )}
      </div>
    </div>
  );
}
