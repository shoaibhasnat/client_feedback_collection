"use client";

import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/ui/client";
import {
  regenerateInvite,
  updateWorkspace,
  type InviteLinkState,
  type UpdateWorkspaceState,
} from "../../actions";

export function EditWorkspaceForm({ workspaceId, name, slug }: { workspaceId: string; name: string; slug: string }) {
  const [state, action] = useActionState<UpdateWorkspaceState, FormData>(updateWorkspace.bind(null, workspaceId), {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.ok && <Alert tone="green">Saved.</Alert>}
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" defaultValue={name} required maxLength={120} />
      </Field>
      <Field label="Slug" htmlFor="slug" hint="Changing it changes the public URL.">
        <Input id="slug" name="slug" defaultValue={slug} required />
      </Field>
      <SubmitButton variant="outline">Save</SubmitButton>
    </form>
  );
}

export function InviteLinkForm({ workspaceId, defaultEmail }: { workspaceId: string; defaultEmail: string }) {
  const [state, action] = useActionState<InviteLinkState, FormData>(regenerateInvite.bind(null, workspaceId), {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      {state.inviteUrl && (
        <Alert tone="green">
          <p>New invite link (shown once):</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-white px-2 py-1 text-xs">{state.inviteUrl}</code>
            <CopyButton text={state.inviteUrl} label="Copy link" />
          </div>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Owner email" htmlFor="invite-email" className="min-w-64 flex-1">
          <Input id="invite-email" name="email" type="email" defaultValue={defaultEmail} required />
        </Field>
        <SubmitButton variant="outline">Generate new invite link</SubmitButton>
      </div>
    </form>
  );
}
