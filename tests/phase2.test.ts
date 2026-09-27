/**
 * Phase 2 rules that must hold in the database itself, not just the UI:
 * submissions are the client's words (owner can't edit them), consent limits publishing,
 * consent withdrawal unpublishes, media stays in the workspace, and request snapshots are frozen.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanupRun, createTenant, destroyTenant, type Tenant } from "./helpers";

let A: Tenant;
let B: Tenant;
const admin = adminClient();

async function submission(consent: "full" | "partial" | "anonymous" | "private") {
  const { data: req } = await admin
    .from("requests")
    .insert({
      workspace_id: A.workspaceId,
      client_id: A.ids.clients,
      template_snapshot: { version: 2, items: [] },
      token: `tok-${consent}-${Math.random().toString(36).slice(2)}-padpadpad`,
    })
    .select("id")
    .single();
  const { data: sub } = await admin
    .from("submissions")
    .insert({
      workspace_id: A.workspaceId,
      request_id: req!.id,
      answers: { result: "Original client wording" },
      consent_level: consent,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return { requestId: req!.id as string, submissionId: sub!.id as string };
}

async function testimonial(submissionId: string, fields: Record<string, unknown> = {}) {
  const { data, error } = await A.client
    .from("testimonials")
    .insert({ workspace_id: A.workspaceId, submission_id: submissionId, display_quote: "Great work", ...fields })
    .select("id, consent_level, visibility")
    .single();
  return { data, error };
}

beforeAll(async () => {
  A = await createTenant("p2a");
  B = await createTenant("p2b");
});

afterAll(async () => {
  await destroyTenant(A);
  await destroyTenant(B);
  await cleanupRun();
});

describe("submissions are the client's words", () => {
  it("owner cannot rewrite answers or consent", async () => {
    const { submissionId } = await submission("private");
    const { error } = await A.client.from("submissions").update({ answers: { result: "Forged" }, consent_level: "full" }).eq("id", submissionId);
    expect(error).not.toBeNull();
    const { data } = await admin.from("submissions").select("answers, consent_level").eq("id", submissionId).single();
    expect(data).toMatchObject({ answers: { result: "Original client wording" }, consent_level: "private" });
  });

  it("owner cannot insert a submission", async () => {
    const { error } = await A.client.from("submissions").insert({ workspace_id: A.workspaceId, consent_level: "full" });
    expect(error).not.toBeNull();
  });

  it("owner can still do merge bookkeeping and reopen", async () => {
    const { submissionId } = await submission("full");
    const { error } = await A.client
      .from("submissions")
      .update({ merge_status: "merged", merge_resolved_at: new Date().toISOString(), submitted_at: null })
      .eq("id", submissionId);
    expect(error).toBeNull();
  });
});

describe("consent is enforced by the database", () => {
  it("a Private testimonial cannot be published", async () => {
    const { submissionId } = await submission("private");
    const { error } = await testimonial(submissionId, { visibility: "published" });
    expect(error?.message).toContain("consent_violation");
  });

  it("the owner cannot restate consent on the testimonial", async () => {
    const { submissionId } = await submission("private");
    const { data } = await testimonial(submissionId, { consent_level: "full" });
    expect(data?.consent_level).toBe("private");
    const { error } = await A.client.from("testimonials").update({ visibility: "published", consent_level: "full" }).eq("id", data!.id);
    expect(error?.message).toContain("consent_violation");
  });

  it("Anonymous allows the quote only", async () => {
    const { submissionId } = await submission("anonymous");
    expect((await testimonial(submissionId, { visibility: "published", display_name: "Ada Lovelace" })).error).not.toBeNull();
    const ok = await testimonial((await submission("anonymous")).submissionId, {
      visibility: "published",
      display_role: "Founder, e-commerce brand",
    });
    expect(ok.error).toBeNull();
  });

  it("Partial allows a first name plus role or company, no photo", async () => {
    const tooMuch = await testimonial((await submission("partial")).submissionId, {
      visibility: "published",
      display_name: "Ada Lovelace",
    });
    expect(tooMuch.error).not.toBeNull();
    const both = await testimonial((await submission("partial")).submissionId, {
      visibility: "published",
      display_name: "Ada",
      display_role: "CEO",
      display_company: "Analytical",
    });
    expect(both.error).not.toBeNull();
    const ok = await testimonial((await submission("partial")).submissionId, {
      visibility: "published",
      display_name: "Ada",
      display_company: "Analytical",
    });
    expect(ok.error).toBeNull();
  });

  it("Full consent publishes everything", async () => {
    const { error } = await testimonial((await submission("full")).submissionId, {
      visibility: "published",
      display_name: "Ada Lovelace",
      display_role: "CEO",
      display_company: "Analytical",
      photo_url: `${A.workspaceId}/submissions/x/photo.webp`,
    });
    expect(error).toBeNull();
  });

  it("withdrawing consent unpublishes the testimonial", async () => {
    const { submissionId } = await submission("full");
    const { data } = await testimonial(submissionId, { visibility: "published", display_name: "Ada Lovelace" });
    expect(data?.visibility).toBe("published");
    // The client reopens the link and resubmits as Private (token form writes with the service role).
    await admin.from("submissions").update({ consent_level: "private" }).eq("id", submissionId);
    const { data: after } = await admin.from("testimonials").select("visibility, consent_level").eq("id", data!.id).single();
    expect(after).toMatchObject({ visibility: "hidden", consent_level: "private" });
  });

  it("manual testimonials (no submission) are not consent-limited", async () => {
    const { error } = await A.client
      .from("testimonials")
      .insert({ workspace_id: A.workspaceId, source: "upwork_review", display_quote: "From Upwork", display_name: "Grace Hopper", visibility: "published" });
    expect(error).toBeNull();
  });
});

describe("media stays inside the workspace", () => {
  it("rejects a photo from another workspace's folder", async () => {
    const { error } = await testimonial((await submission("full")).submissionId, { photo_url: B.filePath });
    expect(error?.message).toContain("photo_url");
  });

  it("proof may be an uploaded file or an external link, nothing else", async () => {
    const base = { workspace_id: A.workspaceId, source: "manual", display_quote: "Proof test" };
    expect((await A.client.from("testimonials").insert({ ...base, proof_url: "https://www.upwork.com/review/1" })).error).toBeNull();
    expect((await A.client.from("testimonials").insert({ ...base, proof_url: `${A.workspaceId}/testimonials/proof/a.webp` })).error).toBeNull();
    expect((await A.client.from("testimonials").insert({ ...base, proof_url: B.filePath })).error).not.toBeNull();
    expect((await A.client.from("testimonials").insert({ ...base, proof_url: "javascript:alert(1)" })).error).not.toBeNull();
  });
});

describe("request snapshots are frozen", () => {
  it("editing the template never changes an existing request", async () => {
    const snapshotItems = [{ key: "result", label: "What result did you get?" }];
    const { data: req } = await A.client
      .from("requests")
      .insert({
        workspace_id: A.workspaceId,
        client_id: A.ids.clients,
        template_id: A.ids.form_templates,
        template_snapshot: { version: 2, items: snapshotItems },
        token: `frozen-${Math.random().toString(36).slice(2)}-padpadpad`,
      })
      .select("id")
      .single();

    await A.client.from("form_items").update({ label: "Edited after sending" }).eq("template_id", A.ids.form_templates);
    const { data } = await admin.from("requests").select("template_snapshot").eq("id", req!.id).single();
    expect((data!.template_snapshot as { items: unknown[] }).items).toEqual(snapshotItems);
  });

  it("the snapshot itself cannot be rewritten", async () => {
    const { data, error } = await A.client
      .from("requests")
      .update({ template_snapshot: { version: 2, items: [{ key: "forged" }] } })
      .eq("id", A.ids.requests)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    expect(error?.message ?? "").toContain("immutable");
  });
});

describe("custom fields and tags are per workspace", () => {
  it("the same custom field key can exist in two workspaces, but not twice in one", async () => {
    const def = { entity: "client", key: "industry_segment", label: "Industry segment", type: "text" };
    expect((await A.client.from("settings_custom_fields").insert({ ...def, workspace_id: A.workspaceId })).error).toBeNull();
    expect((await B.client.from("settings_custom_fields").insert({ ...def, workspace_id: B.workspaceId })).error).toBeNull();
    expect((await A.client.from("settings_custom_fields").insert({ ...def, workspace_id: A.workspaceId })).error).not.toBeNull();
  });

  it("an owner cannot tag their testimonial with another workspace's tag", async () => {
    const { error } = await A.client
      .from("testimonial_tags")
      .insert({ workspace_id: A.workspaceId, testimonial_id: A.ids.testimonials, tag_id: B.ids.tags });
    expect(error).not.toBeNull();
  });
});
