"use client";

import { useActionState } from "react";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { acceptInvite, type InviteState } from "./actions";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<InviteState, FormData>(acceptInvite.bind(null, token), {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" value={email} disabled readOnly />
      </Field>
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton className="w-full" pendingText="Creating your workspace…">
        Create account
      </SubmitButton>
    </form>
  );
}
