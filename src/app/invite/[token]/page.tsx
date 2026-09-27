import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { lookupInvite } from "@/lib/invites";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Accept invitation" };

const messages = {
  invalid: "This invite link isn't valid. Check you copied the whole link.",
  expired: "This invite link has expired. Ask the administrator for a new one.",
  used: "This invite has already been accepted. Sign in instead.",
  revoked: "This invite link was replaced or cancelled. Ask the administrator for a new one.",
} as const;

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const lookup = await lookupInvite(token);

  if (lookup.state !== "valid") {
    return (
      <AuthShell title="Invitation unavailable">
        <p className="text-sm text-slate-600">{messages[lookup.state]}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-slate-900 underline">
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join ${lookup.workspaceName}`} subtitle="Set your name and password to open your workspace.">
      <InviteForm token={token} email={lookup.invite.email} />
    </AuthShell>
  );
}
