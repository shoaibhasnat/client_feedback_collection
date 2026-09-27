"use client";

import { useActionState } from "react";
import { Alert, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { PROJECT_PLATFORMS, PROJECT_STATUSES } from "@/lib/constants";
import type { FormState } from "./actions";

export type ProjectFormValues = {
  client_id?: string;
  name?: string;
  description?: string | null;
  service_type?: string | null;
  platform?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  budget?: number | null;
  currency?: string | null;
  links?: { label: string; url: string }[];
  outcomes?: string | null;
  notes?: string | null;
};

export function ProjectForm({
  action,
  values = {},
  clients,
  isNew,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  values?: ProjectFormValues;
  clients: { id: string; name: string }[];
  isNew?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  const s = (v: string | null | undefined) => v ?? "";

  return (
    <form action={formAction} className="space-y-6">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <Card>
        <CardHeader title="Project" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Client" htmlFor="client_id" error={fe.client_id}>
            <Select id="client_id" name="client_id" defaultValue={values.client_id ?? ""} required>
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
          <Field label="Project name" htmlFor="name" error={fe.name}>
            <Input id="name" name="name" defaultValue={s(values.name)} required maxLength={200} />
          </Field>
          <Field label="Short description" htmlFor="description" className="sm:col-span-2">
            <Textarea id="description" name="description" rows={2} defaultValue={s(values.description)} />
          </Field>
          <Field label="Service type" htmlFor="service_type" hint="e.g. Shopify speed optimization">
            <Input id="service_type" name="service_type" defaultValue={s(values.service_type)} maxLength={100} />
          </Field>
          <Field label="Platform" htmlFor="platform">
            <Select id="platform" name="platform" defaultValue={values.platform ?? "direct"}>
              {PROJECT_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start date" htmlFor="start_date">
            <Input id="start_date" name="start_date" type="date" defaultValue={s(values.start_date)} />
          </Field>
          <Field label="End date" htmlFor="end_date" error={fe.end_date}>
            <Input id="end_date" name="end_date" type="date" defaultValue={s(values.end_date)} />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={values.status ?? "completed"}>
              {PROJECT_STATUSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Budget (private)" htmlFor="budget" className="col-span-2" error={fe.budget}>
              <Input id="budget" name="budget" type="number" min={0} step="0.01" defaultValue={values.budget ?? ""} />
            </Field>
            <Field label="Currency" htmlFor="currency" error={fe.currency}>
              <Input id="currency" name="currency" defaultValue={values.currency ?? "USD"} maxLength={3} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Deliverables and results" />
        <div className="grid gap-4 p-5">
          <Field
            label="Links"
            htmlFor="links"
            hint="One per line. Optional label first: “Live site | https://example.com”"
            error={fe.links}
          >
            <Textarea
              id="links"
              name="links"
              rows={3}
              defaultValue={(values.links ?? []).map((l) => (l.label ? `${l.label} | ${l.url}` : l.url)).join("\n")}
            />
          </Field>
          <Field label="Results / outcomes you observed" htmlFor="outcomes" hint="e.g. Page speed 38 → 92. Useful when writing the display quote.">
            <Textarea id="outcomes" name="outcomes" rows={3} defaultValue={s(values.outcomes)} />
          </Field>
          <Field label="Private notes" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} defaultValue={s(values.notes)} />
          </Field>
        </div>
      </Card>

      <SubmitButton>{isNew ? "Create project" : "Save changes"}</SubmitButton>
    </form>
  );
}
