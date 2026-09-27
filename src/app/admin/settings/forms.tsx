"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import {
  changePasswordAction,
  saveMessageTemplatesAction,
  saveProfileAction,
  type SettingsState,
} from "./actions";

function Status({ state }: { state: SettingsState }) {
  if (state.error) return <Alert tone="red">{state.error}</Alert>;
  if (state.ok) return <Alert tone="green">Saved.</Alert>;
  return null;
}

export function ProfileForm({
  values,
}: {
  values: { name: string; tagline: string; services: string; contact_links: string; share_url: string; photo: string | null };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveProfileAction, {});
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <Field label="Name" htmlFor="p-name">
        <Input id="p-name" name="name" defaultValue={values.name} required maxLength={120} />
      </Field>
      <Field label="Photo" htmlFor="p-photo" hint="Shown on the form's welcome screen. Cropped to a square.">
        <div className="flex items-center gap-3">
          {values.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.photo} alt="" className="size-12 rounded-full object-cover" />
          )}
          <Input id="p-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="h-auto py-1.5" />
        </div>
        {values.photo && (
          <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="remove_photo" /> Remove photo
          </label>
        )}
      </Field>
      <Field label="Tagline" htmlFor="p-tagline" hint="e.g. Shopify developer for fast-growing stores">
        <Input id="p-tagline" name="tagline" defaultValue={values.tagline} maxLength={200} />
      </Field>
      <Field label="Services" htmlFor="p-services" hint="One per line.">
        <Textarea id="p-services" name="services" rows={3} defaultValue={values.services} />
      </Field>
      <Field label="Contact links" htmlFor="p-links" hint="One per line, e.g. your Upwork profile or booking page.">
        <Textarea id="p-links" name="contact_links" rows={3} defaultValue={values.contact_links} />
      </Field>
      <Field label="Link clients can share" htmlFor="p-share" hint="Used by the “Share my link” button on the thank-you screen.">
        <Input id="p-share" name="share_url" type="url" defaultValue={values.share_url} placeholder="https://" />
      </Field>
      <SubmitButton>Save profile</SubmitButton>
    </form>
  );
}

export function MessageTemplatesForm({
  values,
}: {
  values: { upwork: string; email: string; whatsapp: string; reminder: string; reminder_days: number };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveMessageTemplatesAction, {});
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <Field label="Upwork chat" htmlFor="t-upwork">
        <Textarea id="t-upwork" name="upwork" rows={3} defaultValue={values.upwork} required />
      </Field>
      <Field label="Email" htmlFor="t-email">
        <Textarea id="t-email" name="email" rows={5} defaultValue={values.email} required />
      </Field>
      <Field label="WhatsApp" htmlFor="t-whatsapp">
        <Textarea id="t-whatsapp" name="whatsapp" rows={2} defaultValue={values.whatsapp} required />
      </Field>
      <Field label="Reminder" htmlFor="t-reminder">
        <Textarea id="t-reminder" name="reminder" rows={2} defaultValue={values.reminder} required />
      </Field>
      <Field label="Flag requests with no response after (days)" htmlFor="t-days">
        <Input id="t-days" name="reminder_days" type="number" min={1} max={60} defaultValue={values.reminder_days} className="w-28" />
      </Field>
      <SubmitButton>Save templates</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<SettingsState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <Status state={state} />
      <Field label="Current password" htmlFor="pw-current">
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 8 characters.">
        <Input id="pw-new" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-confirm">
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton variant="outline">Change password</SubmitButton>
    </form>
  );
}
