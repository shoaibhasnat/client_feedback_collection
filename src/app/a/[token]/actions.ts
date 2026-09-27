"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadApproval } from "@/lib/approval-token";
import { clientIp, sha256 } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";

export type RespondState = { error?: string; done?: "approved" | "changes_requested" };

const schema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({
    decision: z.literal("changes"),
    comment: z.string().trim().min(3, "Tell us what you'd like changed.").max(2000, "Keep it under 2000 characters."),
  }),
]);

/** The client's answer to an approval link. Only a pending request for this exact token can be answered. */
export async function respondToApproval(token: string, _prev: RespondState, formData: FormData): Promise<RespondState> {
  const ip = await clientIp();
  if (!rateLimit(`approve:${ip}`, 20, 10 * 60_000) || !rateLimit(`approve:t:${token}`, 10, 10 * 60_000)) {
    return { error: "Too many attempts. Please wait a few minutes." };
  }
  const parsed = schema.safeParse({ decision: formData.get("decision"), comment: formData.get("comment") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please try again." };

  const loaded = await loadApproval(token);
  if (loaded.state !== "ok") return { error: "This link is no longer active." };
  const t = loaded.testimonial;
  if (t.approval_status !== "pending") return { error: "You've already responded. Thank you!" };

  const status = parsed.data.decision === "approve" ? "approved" : "changes_requested";
  const admin = createAdminClient();
  // Match on the hash and pending status again so a replaced or cancelled link can't answer.
  const { data: updated } = await admin
    .from("testimonials")
    .update({
      approval_status: status,
      approval_responded_at: new Date().toISOString(),
      approval_comment: parsed.data.decision === "changes" ? parsed.data.comment : null,
    })
    .eq("id", t.id)
    .eq("approval_token_hash", sha256(token))
    .eq("approval_status", "pending")
    .select("id");
  if (!updated?.length) return { error: "This link is no longer active." };

  await admin.from("activity_log").insert({
    workspace_id: t.workspace_id,
    client_id: t.client_id,
    entity_type: "testimonial",
    entity_id: t.id,
    action: status === "approved" ? "approval_approved" : "approval_changes_requested",
  });
  revalidatePath("/admin", "layout");
  return { done: status };
}
