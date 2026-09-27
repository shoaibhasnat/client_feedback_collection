"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { requestPasswordReset, type AuthState } from "../login/actions";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      <form action={action} className="space-y-4">
        {state.error && <Alert tone="red">{state.error}</Alert>}
        {state.message && <Alert tone="green">{state.message}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton className="w-full" pendingText="Sending…">
          Send reset link
        </SubmitButton>
        <p className="text-center text-sm">
          <Link href="/login" className="text-slate-500 hover:text-slate-900">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
