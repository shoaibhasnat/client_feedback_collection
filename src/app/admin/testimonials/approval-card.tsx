"use client";

import { useActionState } from "react";
import { Alert, Badge, Card, CardHeader } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/ui/client";
import { formatDate } from "@/lib/utils";
import { cancelApprovalAction, requestApprovalAction, type ApprovalState } from "./actions";

export type ApprovalInfo = {
  status: "not_needed" | "pending" | "approved" | "changes_requested";
  requestedAt: string | null;
  respondedAt: string | null;
  comment: string | null;
};

const TONE = { not_needed: "slate", pending: "amber", approved: "green", changes_requested: "red" } as const;
const LABEL = { not_needed: "Not requested", pending: "Awaiting client", approved: "Approved", changes_requested: "Changes suggested" };

/**
 * Ask the client to approve the edited wording. The link is shown once (only its hash is
 * stored); asking again replaces it. Editing the quote after asking voids the approval.
 */
export function ApprovalCard({
  testimonialId,
  approval,
  edited,
  readOnly,
}: {
  testimonialId: string | null;
  approval: ApprovalInfo | null;
  /** True when the saved quote isn't word-for-word from the client's answers. */
  edited: boolean;
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ApprovalState>(
    requestApprovalAction.bind(null, testimonialId ?? ""),
    {},
  );
  const status = approval?.status ?? "not_needed";

  return (
    <Card id="approval">
      <CardHeader
        title="Client approval"
        description={
          edited
            ? "Your quote differs from the client's own wording. It's good practice to ask them to approve it."
            : "The quote uses the client's own words. Approval is optional."
        }
        action={<Badge tone={TONE[status]}>{LABEL[status]}</Badge>}
      />
      <div className="space-y-3 p-5 text-sm">
        {status === "pending" && approval?.requestedAt && <p className="text-slate-600">Link created {formatDate(approval.requestedAt, true)}.</p>}
        {status === "approved" && approval?.respondedAt && (
          <p className="text-emerald-700">The client approved this wording on {formatDate(approval.respondedAt, true)}.</p>
        )}
        {status === "changes_requested" && (
          <div className="rounded-md bg-red-50 p-3 text-red-900">
            <p className="font-medium">Suggested changes{approval?.respondedAt ? ` (${formatDate(approval.respondedAt, true)})` : ""}:</p>
            <p className="mt-1 whitespace-pre-wrap">{approval?.comment}</p>
          </div>
        )}

        {state.error && <Alert tone="red">{state.error}</Alert>}
        {state.link && (
          <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="font-medium text-emerald-900">Approval link ready. Copy it now: it won&rsquo;t be shown again.</p>
            <p className="break-all font-mono text-xs text-slate-700">{state.link}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={state.link} label="Copy link" />
              {state.message && <CopyButton text={state.message} label="Copy message" />}
            </div>
          </div>
        )}

        {!readOnly && testimonialId && (
          <div className="flex flex-wrap gap-2">
            <form action={formAction}>
              <SubmitButton size="sm" pendingText="Creating link…" variant={status === "not_needed" ? "primary" : "outline"}>
                {status === "not_needed" ? "Ask client to approve" : "Create a new approval link"}
              </SubmitButton>
            </form>
            {status === "pending" && (
              <form action={cancelApprovalAction.bind(null, testimonialId)}>
                <SubmitButton size="sm" variant="ghost" pendingText="Cancelling…">
                  Cancel request
                </SubmitButton>
              </form>
            )}
          </div>
        )}
        {!testimonialId && <p className="text-xs text-slate-500">Save the testimonial first, then ask for approval.</p>}
      </div>
    </Card>
  );
}
