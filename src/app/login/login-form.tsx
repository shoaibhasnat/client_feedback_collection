"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { signIn, type AuthState } from "./actions";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4">
      {notice && <Alert tone="amber">{notice}</Alert>}
      {state.error && <Alert tone="red">{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-slate-500 hover:text-slate-900">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
