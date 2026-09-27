/**
 * Security review (27 Sep 2026) — regression tests for the issues found and fixed:
 *  1. Storage path traversal: "{mine}/../{theirs}/file" passed "starts with my workspace" checks,
 *     and storage clients resolve "..", so service-role reads could reach another workspace.
 *  2. A form testimonial could be unlinked from its submission to escape the client's consent.
 *  3. Stored URLs rendered as links must never become script URLs.
 * Plus direct-API attacks a malicious owner could try with their own session.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isSafeStoragePath, isWellFormedStoragePath } from "@/lib/storage-path";
import { signFormImages } from "@/lib/public-form";
import { safeHref } from "@/lib/utils";
import { adminClient, anonClient, cleanupRun, createTenant, destroyTenant, type Tenant } from "./helpers";

let A: Tenant;
let B: Tenant;
const admin = adminClient();

beforeAll(async () => {
  A = await createTenant("seca");
  B = await createTenant("secb");
});

afterAll(async () => {
  await destroyTenant(A);
  await destroyTenant(B);
  await cleanupRun();
});

const traversal = () => [
  `${A.workspaceId}/../${B.filePath}`,
  `${A.workspaceId}/%2e%2e/${B.filePath}`,
  `${A.workspaceId}/./../${B.filePath}`,
  `${A.workspaceId}/clients/..\\..\\${B.filePath}`,
  `${A.workspaceId}//${B.filePath}`,
];

describe("storage path validation", () => {
  it("accepts every path shape the app creates", () => {
    const ws = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";
    for (const p of [
      `${ws}/submissions/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0/video-AbC_12-x.webm`,
      `${ws}/clients/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0/AbCdEfGhIjKl.webp`,
      `${ws}/projects/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0/x9.pdf`,
      `${ws}/testimonials/thumbnails/q-w_e.webp`,
      `${ws}/x.pdf`,
    ]) {
      expect(isSafeStoragePath(p, ws), p).toBe(true);
    }
  });

  it("rejects traversal, encoded dots, backslashes and empty segments", () => {
    for (const p of traversal()) {
      expect(isSafeStoragePath(p, A.workspaceId), p).toBe(false);
      expect(isWellFormedStoragePath(p), p).toBe(false);
    }
    expect(isSafeStoragePath(B.filePath, A.workspaceId)).toBe(false);
  });

  it("the database agrees", async () => {
    const check = async (p: string) => (await admin.rpc("is_workspace_path", { p, ws: A.workspaceId })).data;
    expect(await check(A.filePath)).toBe(true);
    for (const p of traversal()) expect(await check(p), p).toBe(false);
  });
});

describe("a malicious owner can't reach another workspace's file", () => {
  it("testimonial media paths with '..' are refused by the database", async () => {
    for (const p of traversal()) {
      const { error } = await A.client.from("testimonials").update({ photo_url: p }).eq("id", A.ids.testimonials);
      expect(error?.message, p).toMatch(/must be a file in this workspace/);
    }
  });

  it("public media/brand functions never release a traversal path, even if one is stored", async () => {
    // Plant the paths with the service role (as if written before this fix).
    const evil = `${A.workspaceId}/../${B.filePath}`;
    await admin.from("site_settings").update({ profile: { photo_url: evil } }).eq("workspace_id", A.workspaceId);
    const { data } = await anonClient().rpc("public_brand_path", { p_workspace: A.workspaceId, p_kind: "owner_photo" });
    expect(data).toBeNull();
  });

  it("the client form never signs a traversal path", async () => {
    const urls = await signFormImages(A.workspaceId, { submissionId: A.ids.submissions, clientId: A.ids.clients, snapshotPrefills: traversal() }, [
      ...traversal(),
      `${A.workspaceId}/clients/${A.ids.clients}/../../../${B.filePath}`,
    ]);
    expect(urls).toEqual({});
    // …while a legitimate file of this client is still signed.
    const ok = await signFormImages(A.workspaceId, { submissionId: null, clientId: A.ids.clients }, [A.filePath]);
    expect(Object.keys(ok)).toEqual([A.filePath]);
  });
});

describe("consent can't be escaped by unlinking a testimonial", () => {
  it("a form testimonial stays linked to its submission", async () => {
    const { error } = await A.client.from("testimonials").update({ submission_id: null, consent_level: "full" }).eq("id", A.ids.testimonials);
    expect(error?.message).toMatch(/stays linked/);
  });
});

describe("direct API attacks by a signed-in owner", () => {
  it("can't make themselves super admin or change their status", async () => {
    await A.client.from("profiles").update({ is_super_admin: true }).eq("id", A.userId);
    await A.client.from("profiles").update({ status: "active", email: "x@y.test" }).eq("id", A.userId);
    const { data } = await admin.from("profiles").select("is_super_admin, email").eq("id", A.userId).single();
    expect(data!.is_super_admin).toBe(false);
    expect(data!.email).toBe(A.email);
  });

  it("can't change their workspace's status, slug or public key", async () => {
    const before = (await admin.from("workspaces").select("status, slug, public_key").eq("id", A.workspaceId).single()).data;
    await A.client.from("workspaces").update({ status: "active", slug: "hijack", public_key: "0".repeat(32) }).eq("id", A.workspaceId);
    const after = (await admin.from("workspaces").select("status, slug, public_key").eq("id", A.workspaceId).single()).data;
    expect(after).toEqual(before);
  });

  it("can't join another workspace or read invites and the audit log", async () => {
    const { error } = await A.client.from("workspace_members").insert({ workspace_id: B.workspaceId, user_id: A.userId, role: "owner" });
    expect(error).not.toBeNull();
    expect((await A.client.from("invites").select("id")).data ?? []).toEqual([]);
    expect((await A.client.from("audit_log").select("id")).data ?? []).toEqual([]);
  });

  it("can't call privileged functions", async () => {
    expect((await A.client.rpc("seed_workspace", { ws: B.workspaceId })).error).not.toBeNull();
    expect((await A.client.rpc("superadmin_workspace_stats")).error).not.toBeNull();
  });

  it("can't link their rows to another workspace's records", async () => {
    const { error } = await A.client
      .from("testimonials")
      .insert({ workspace_id: A.workspaceId, submission_id: B.ids.submissions, source: "form", display_quote: "x" });
    expect(error).not.toBeNull();
  });

  it("can't rewrite what the client submitted", async () => {
    await A.client.from("submissions").update({ answers: { result: "forged" }, consent_level: "full" }).eq("id", A.ids.submissions);
    const { data } = await admin.from("submissions").select("answers").eq("id", A.ids.submissions).single();
    expect(JSON.stringify(data!.answers)).not.toContain("forged");
  });
});

describe("links from stored data", () => {
  it("only http(s) and mailto are rendered", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref("mailto:a@b.test")).toBe("mailto:a@b.test");
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.test", "https://a b", null, undefined]) {
      expect(safeHref(bad as string), String(bad)).toBeUndefined();
    }
  });
});
