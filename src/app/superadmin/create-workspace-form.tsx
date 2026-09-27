"use client";

import { useActionState, useState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/ui/client";
import { slugify } from "@/lib/utils";
import { createWorkspace, type CreateWorkspaceState } from "./actions";

export function CreateWorkspaceForm() {
  const [state, action] = useActionState<CreateWorkspaceState, FormData>(createWorkspace, {});

  return (
    <div className="space-y-4">
      {state.inviteUrl && (
        <Alert tone="green">
          <p className="font-medium">Workspace “{state.workspaceName}” created.</p>
          <p className="mt-1">
            Send this invite link to the owner. It&apos;s shown only once and expires after the configured number of days.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-white px-2 py-1 text-xs text-slate-800">{state.inviteUrl}</code>
            <CopyButton text={state.inviteUrl} label="Copy link" />
          </div>
        </Alert>
      )}
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <form action={action} className="grid gap-4 sm:grid-cols-3">
        {/* Remount (and clear) the inputs after each successful create. */}
        <WorkspaceFields key={state.inviteUrl ?? "new"} />
        <div className="sm:col-span-3">
          <SubmitButton pendingText="Creating…">Create workspace and invite</SubmitButton>
        </div>
      </form>
    </div>
  );
}

function WorkspaceFields() {
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  return (
    <>
      <Field label="Workspace name" htmlFor="ws-name">
        <Input
          id="ws-name"
          name="name"
          required
          maxLength={120}
          onChange={(e) => {
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </Field>
      <Field label="Public slug" htmlFor="ws-slug" hint="Public page: /your-slug">
        <Input
          id="ws-slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
        />
      </Field>
      <Field label="Owner email" htmlFor="ws-email">
        <Input id="ws-email" name="email" type="email" required />
      </Field>
    </>
  );
}
