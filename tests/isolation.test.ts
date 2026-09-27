/**
 * Workspace isolation (brief 10.2): user A must not be able to read, list, update, delete
 * or infer any record or file of workspace B — through the database client, storage URLs,
 * or the token-based public form.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUSINESS_TABLES, adminClient, anonClient, cleanupRun, createTenant, destroyTenant, runId, type Tenant } from "./helpers";
import { loadRequestByToken } from "@/lib/public-form";

let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  A = await createTenant("a");
  B = await createTenant("b");
});

afterAll(async () => {
  await destroyTenant(A);
  await destroyTenant(B);
  await cleanupRun();
});

describe("database: user A vs workspace B", () => {
  it.each(BUSINESS_TABLES)("%s: A lists only its own rows", async (table) => {
    const { data, error } = await A.client.from(table).select("id, workspace_id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => r.workspace_id === A.workspaceId)).toBe(true);
  });

  it.each(BUSINESS_TABLES)("%s: A cannot read B's row by id", async (table) => {
    const { data } = await A.client.from(table).select("*").eq("id", B.ids[table]);
    expect(data ?? []).toHaveLength(0);
  });

  it.each(BUSINESS_TABLES)("%s: A cannot update B's row", async (table) => {
    const { data } = await A.client.from(table).update({ updated_at: new Date(0).toISOString() }).eq("id", B.ids[table]).select("id");
    expect(data ?? []).toHaveLength(0);
    const { data: still } = await adminClient().from(table).select("updated_at").eq("id", B.ids[table]).single();
    expect(new Date(still!.updated_at).getFullYear()).toBeGreaterThan(1970);
  });

  it.each(BUSINESS_TABLES)("%s: A cannot delete B's row", async (table) => {
    await A.client.from(table).delete().eq("id", B.ids[table]);
    const { data } = await adminClient().from(table).select("id").eq("id", B.ids[table]);
    expect(data).toHaveLength(1);
  });

  it("A cannot insert rows into workspace B", async () => {
    const { error } = await A.client.from("clients").insert({ workspace_id: B.workspaceId, name: "Intruder" });
    expect(error).not.toBeNull();
  });

  it("A cannot move its own row into workspace B", async () => {
    await A.client.from("clients").update({ workspace_id: B.workspaceId }).eq("id", A.ids.clients);
    const { data } = await adminClient().from("clients").select("workspace_id").eq("id", A.ids.clients).single();
    expect(data!.workspace_id).toBe(A.workspaceId);
  });

  it("A cannot link its row to B's client (composite foreign keys)", async () => {
    const { error } = await A.client.from("projects").insert({ workspace_id: A.workspaceId, client_id: B.ids.clients, name: "Cross link" });
    expect(error).not.toBeNull();
  });

  it("rows default to the caller's workspace", async () => {
    const { data, error } = await A.client.from("tags").insert({ name: `Default-${runId}` }).select("workspace_id").single();
    expect(error).toBeNull();
    expect(data!.workspace_id).toBe(A.workspaceId);
  });

  it("tag names are unique per workspace, not globally", async () => {
    const { data } = await adminClient().from("tags").select("workspace_id").eq("name", "Shopify").in("workspace_id", [A.workspaceId, B.workspaceId]);
    expect(data).toHaveLength(2);
  });

  it("A sees only its own workspace and membership", async () => {
    const { data: workspaces } = await A.client.from("workspaces").select("id");
    expect(workspaces!.map((w) => w.id)).toEqual([A.workspaceId]);
    const { data: members } = await A.client.from("workspace_members").select("workspace_id");
    expect(members!.map((m) => m.workspace_id)).toEqual([A.workspaceId]);
  });

  it("A cannot read other profiles, invites or the audit log", async () => {
    const { data: profiles } = await A.client.from("profiles").select("id");
    expect(profiles!.map((p) => p.id)).toEqual([A.userId]);
    const { data: invites } = await A.client.from("invites").select("id");
    expect(invites ?? []).toHaveLength(0);
    const { data: audit } = await A.client.from("audit_log").select("id");
    expect(audit ?? []).toHaveLength(0);
  });

  it("A cannot make itself super admin", async () => {
    await A.client.from("profiles").update({ is_super_admin: true }).eq("id", A.userId);
    const { data } = await adminClient().from("profiles").select("is_super_admin").eq("id", A.userId).single();
    expect(data!.is_super_admin).toBe(false);
  });

  it("A cannot call privileged functions", async () => {
    const { error: seedError } = await A.client.rpc("seed_workspace", { ws: B.workspaceId });
    expect(seedError).not.toBeNull();
    const { error: statsError } = await A.client.rpc("superadmin_workspace_stats");
    expect(statsError).not.toBeNull();
  });
});

describe("storage: user A vs workspace B files", () => {
  it("A can read its own file", async () => {
    const { error } = await A.client.storage.from("uploads").download(A.filePath);
    expect(error).toBeNull();
  });

  it("A cannot download B's file", async () => {
    const { data, error } = await A.client.storage.from("uploads").download(B.filePath);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("A cannot sign a URL for B's file", async () => {
    const { data } = await A.client.storage.from("uploads").createSignedUrl(B.filePath, 60);
    expect(data?.signedUrl ?? null).toBeNull();
  });

  it("A cannot list B's folder", async () => {
    const { data } = await A.client.storage.from("uploads").list(`${B.workspaceId}/clients/${B.ids.clients}`);
    expect(data ?? []).toHaveLength(0);
  });

  it("A cannot upload into B's folder", async () => {
    const { error } = await A.client.storage.from("uploads").upload(`${B.workspaceId}/intruder.png`, Buffer.from("x"), { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("A cannot delete B's file", async () => {
    await A.client.storage.from("uploads").remove([B.filePath]);
    const { data } = await adminClient().storage.from("uploads").list(`${B.workspaceId}/clients/${B.ids.clients}`);
    expect(data!.map((f) => f.name)).toContain("secret.png");
  });

  it("the bucket is not publicly readable", async () => {
    const res = await fetch(anonClient().storage.from("uploads").getPublicUrl(B.filePath).data.publicUrl);
    expect(res.ok).toBe(false);
  });
});

describe("anonymous visitors and public token links", () => {
  it("anon cannot read any business table", async () => {
    const anon = anonClient();
    for (const table of BUSINESS_TABLES) {
      const { data } = await anon.from(table).select("id");
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  it("public sign-up is disabled", async () => {
    const { data, error } = await anonClient().auth.signUp({ email: `walk-in-${runId}@example.test`, password: "a-long-password-123" });
    expect(data.user).toBeNull();
    expect(error).not.toBeNull();
  });

  it("a request token resolves to exactly its own workspace", async () => {
    const res = await loadRequestByToken(B.token);
    expect(res.state).toBe("ok");
    if (res.state === "ok") {
      expect(res.request.workspace_id).toBe(B.workspaceId);
      expect(res.request.id).toBe(B.ids.requests);
    }
  });

  it("unknown or malformed tokens reveal nothing", async () => {
    expect((await loadRequestByToken("x".repeat(32))).state).toBe("invalid");
    expect((await loadRequestByToken("../../etc")).state).toBe("invalid");
  });
});

describe("suspension", () => {
  it("a suspended workspace is read-only for its owner and its links pause", async () => {
    const admin = adminClient();
    await admin.from("workspaces").update({ status: "suspended" }).eq("id", A.workspaceId);
    try {
      const { data: rows } = await A.client.from("clients").select("id").eq("id", A.ids.clients);
      expect(rows).toHaveLength(1);
      const { data: updated } = await A.client.from("clients").update({ company: "Changed" }).eq("id", A.ids.clients).select("id");
      expect(updated ?? []).toHaveLength(0);
      expect((await loadRequestByToken(A.token)).state).toBe("unavailable");
    } finally {
      await admin.from("workspaces").update({ status: "active" }).eq("id", A.workspaceId);
    }
  });

  it("a disabled owner loses data access even with a live session", async () => {
    const admin = adminClient();
    await admin.from("profiles").update({ status: "disabled" }).eq("id", A.userId);
    try {
      const { data } = await A.client.from("clients").select("id");
      expect(data ?? []).toHaveLength(0);
    } finally {
      await admin.from("profiles").update({ status: "active" }).eq("id", A.userId);
    }
  });
});
