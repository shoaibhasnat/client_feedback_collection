import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const notices: Record<string, string> = {
  disabled: "This account is disabled. Contact the app administrator.",
  "no-workspace": "Your account isn't linked to a workspace. Contact the app administrator.",
  "link-expired": "That link has expired or was already used.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? notices[sp.error] : undefined;
  return (
    <AuthShell title="Sign in" subtitle="Accounts are created by invitation only.">
      <LoginForm next={next} notice={error} />
    </AuthShell>
  );
}
