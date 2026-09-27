import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/crypto";

const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;
/** Approval links stop working after 30 days; the owner can create a new one. */
export const APPROVAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type ApprovalTestimonial = {
  id: string;
  workspace_id: string;
  client_id: string | null;
  approval_status: "not_needed" | "pending" | "approved" | "changes_requested";
  approval_quote: string | null;
  approval_requested_at: string | null;
  display_name: string | null;
  display_role: string | null;
  display_company: string | null;
};

export type ApprovalLookup =
  | { state: "invalid" | "unavailable" | "expired" }
  | { state: "ok"; testimonial: ApprovalTestimonial; workspaceName: string };

/** Find the testimonial an approval link points at. Only the token's hash is ever stored. */
export async function loadApproval(token: string): Promise<ApprovalLookup> {
  if (!TOKEN_RE.test(token)) return { state: "invalid" };
  const { data } = await createAdminClient()
    .from("testimonials")
    .select(
      "id, workspace_id, client_id, approval_status, approval_quote, approval_requested_at, display_name, display_role, display_company, workspaces(name, status)",
    )
    .eq("approval_token_hash", sha256(token))
    .maybeSingle();
  if (!data) return { state: "invalid" };
  const { workspaces, ...testimonial } = data;
  const ws = workspaces as unknown as { name: string; status: string } | null;
  if (!ws || ws.status === "deleted") return { state: "invalid" };
  if (ws.status !== "active") return { state: "unavailable" };
  if (
    testimonial.approval_status === "pending" &&
    testimonial.approval_requested_at &&
    Date.parse(testimonial.approval_requested_at) + APPROVAL_TTL_MS < Date.now()
  ) {
    return { state: "expired" };
  }
  return { state: "ok", testimonial: testimonial as ApprovalTestimonial, workspaceName: ws.name };
}
