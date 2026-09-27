"use client";

import { useActionState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { updatePassword, type AuthState } from "../login/actions";

export default function ResetPasswordPage() {
  const [state, action] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <AuthShell title="Choose a new password">
      <form action={action} className="space-y-4">
        {state.error && <Alert tone="red">{state.error}</Alert>}
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirm password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <SubmitButton className="w-full">Update password</SubmitButton>
      </form>
    </AuthShell>
  );
}
