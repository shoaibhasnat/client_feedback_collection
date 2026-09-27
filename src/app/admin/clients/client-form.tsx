"use client";

import { useActionState, useState } from "react";
import { Alert, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { CLIENT_SOURCES, CLIENT_STATUSES, CONTACT_METHODS } from "@/lib/constants";
import type { FormState } from "./actions";

export type ClientFormValues = {
  name?: string;
  company?: string | null;
  job_title?: string | null;
  emails?: string[];
  phone?: string | null;
  whatsapp?: string | null;
  linkedin_url?: string | null;
  website?: string | null;
  socials?: string[];
  country?: string | null;
  city?: string | null;
  timezone?: string | null;
  preferred_contact?: string | null;
  source?: string;
  referred_by_client_id?: string | null;
  upwork_url?: string | null;
  status?: string;
  first_project_date?: string | null;
  last_project_date?: string | null;
  follow_up_date?: string | null;
  birthday?: string | null;
  photo_signed?: string | null;
  logo_signed?: string | null;
};

export function ClientForm({
  action,
  values = {},
  otherClients,
  isNew,
  imageError,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  values?: ClientFormValues;
  otherClients: { id: string; name: string }[];
  isNew?: boolean;
  imageError?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [source, setSource] = useState(values.source ?? "direct");
  const fe = state.fieldErrors ?? {};
  const v = (k: keyof ClientFormValues) => (values[k] as string | null | undefined) ?? "";

  return (
    <form action={formAction} className="space-y-6">
      {(state.error || imageError) && <Alert tone="red">{state.error ?? imageError}</Alert>}

      <Card>
        <CardHeader title="Profile" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" error={fe.name}>
            <Input id="name" name="name" defaultValue={v("name")} required maxLength={200} />
          </Field>
          <Field label="Company" htmlFor="company">
            <Input id="company" name="company" defaultValue={v("company")} maxLength={200} />
          </Field>
          <Field label="Job title" htmlFor="job_title">
            <Input id="job_title" name="job_title" defaultValue={v("job_title")} maxLength={200} />
          </Field>
          <Field label="Relationship status" htmlFor="status">
            <Select id="status" name="status" defaultValue={values.status ?? "active"}>
              {CLIENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <ImageField name="photo" label="Photo" current={values.photo_signed} hint="Cropped to a square." />
          <ImageField name="logo" label="Company logo" current={values.logo_signed} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Contact" description="Private. Never shown publicly." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Emails" htmlFor="emails" hint="Separate several with commas." error={fe.emails}>
            <Input id="emails" name="emails" defaultValue={(values.emails ?? []).join(", ")} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={v("phone")} />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp">
            <Input id="whatsapp" name="whatsapp" type="tel" defaultValue={v("whatsapp")} />
          </Field>
          <Field label="Preferred contact method" htmlFor="preferred_contact">
            <Select id="preferred_contact" name="preferred_contact" defaultValue={v("preferred_contact")}>
              <option value="">—</option>
              {CONTACT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="LinkedIn" htmlFor="linkedin_url" error={fe.linkedin_url}>
            <Input id="linkedin_url" name="linkedin_url" type="url" defaultValue={v("linkedin_url")} placeholder="https://" />
          </Field>
          <Field label="Website" htmlFor="website" error={fe.website}>
            <Input id="website" name="website" type="url" defaultValue={v("website")} placeholder="https://" />
          </Field>
          <Field label="Other social links" htmlFor="socials" hint="One per line." className="sm:col-span-2">
            <Textarea id="socials" name="socials" rows={2} defaultValue={(values.socials ?? []).join("\n")} />
          </Field>
          <Field label="Country" htmlFor="country">
            <Input id="country" name="country" defaultValue={v("country")} />
          </Field>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={v("city")} />
          </Field>
          <Field label="Time zone" htmlFor="timezone">
            <Input id="timezone" name="timezone" defaultValue={v("timezone")} placeholder="e.g. Europe/Berlin" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Source and dates" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Source" htmlFor="source">
            <Select id="source" name="source" value={source} onChange={(e) => setSource(e.target.value)}>
              {CLIENT_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          {source === "referral" ? (
            <Field label="Referred by" htmlFor="referred_by_client_id" error={fe.referred_by_client_id}>
              <Select id="referred_by_client_id" name="referred_by_client_id" defaultValue={v("referred_by_client_id")}>
                <option value="">—</option>
                {otherClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="hidden sm:block" />
          )}
          <Field label="Upwork profile or contract URL" htmlFor="upwork_url" error={fe.upwork_url} className="sm:col-span-2">
            <Input id="upwork_url" name="upwork_url" type="url" defaultValue={v("upwork_url")} placeholder="https://www.upwork.com/…" />
          </Field>
          <Field label="First project date" htmlFor="first_project_date">
            <Input id="first_project_date" name="first_project_date" type="date" defaultValue={v("first_project_date")} />
          </Field>
          <Field label="Last project date" htmlFor="last_project_date">
            <Input id="last_project_date" name="last_project_date" type="date" defaultValue={v("last_project_date")} />
          </Field>
          <Field label="Follow-up date" htmlFor="follow_up_date" hint="Shows up in your client list sort.">
            <Input id="follow_up_date" name="follow_up_date" type="date" defaultValue={v("follow_up_date")} />
          </Field>
          <Field label="Birthday or company anniversary" htmlFor="birthday">
            <Input id="birthday" name="birthday" type="date" defaultValue={v("birthday")} />
          </Field>
        </div>
      </Card>

      {isNew && (
        <Card>
          <CardHeader title="First note" description="Optional. Notes are private and timestamped." />
          <div className="p-5">
            <Textarea name="initial_note" aria-label="First note" placeholder="e.g. Prefers voice notes" maxLength={5000} />
          </div>
        </Card>
      )}

      <div className="flex gap-3">
        <SubmitButton>{isNew ? "Create client" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}

function ImageField({ name, label, current, hint }: { name: string; label: string; current?: string | null; hint?: string }) {
  return (
    <Field label={label} htmlFor={name} hint={hint ?? "JPG, PNG or WebP, up to 8 MB."}>
      <div className="flex items-center gap-3">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="" className="size-12 rounded-lg border border-slate-200 object-cover" />
        )}
        <Input id={name} name={name} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="h-auto py-1.5" />
      </div>
      {current && (
        <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name={`remove_${name}`} /> Remove current image
        </label>
      )}
    </Field>
  );
}
