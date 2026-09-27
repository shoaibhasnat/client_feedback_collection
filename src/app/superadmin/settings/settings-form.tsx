"use client";

import { useActionState } from "react";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { updateGlobalSettings, type GlobalSettingsState } from "../actions";

export function GlobalSettingsForm(props: { appName: string; inviteExpiryDays: number; announcement: string }) {
  const [state, action] = useActionState<GlobalSettingsState, FormData>(updateGlobalSettings, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.ok && <Alert tone="green">Saved.</Alert>}
      <Field label="App name" htmlFor="app_name">
        <Input id="app_name" name="app_name" defaultValue={props.appName} required maxLength={80} />
      </Field>
      <Field label="Invite expiry (days)" htmlFor="invite_expiry_days">
        <Input
          id="invite_expiry_days"
          name="invite_expiry_days"
          type="number"
          min={1}
          max={90}
          defaultValue={props.inviteExpiryDays}
          required
        />
      </Field>
      <Field label="Announcement banner" htmlFor="announcement" hint="Shown at the top of every owner dashboard. Leave empty to hide.">
        <Textarea id="announcement" name="announcement" defaultValue={props.announcement} maxLength={500} />
      </Field>
      <SubmitButton>Save settings</SubmitButton>
    </form>
  );
}
