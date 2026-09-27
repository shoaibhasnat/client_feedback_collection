/**
 * Phase 3 — public showcase.
 *  - The anon-only public API returns published, public columns only, per workspace.
 *  - No private value (contact details, notes, budget, raw answers, storage paths) appears in any
 *    public API response or public page source (brief §9 Phase 3, verified here).
 *  - /{slug}?tag=… and collection URLs show exactly the right testimonials.
 * HTTP checks run against the dev/prod server at NEXT_PUBLIC_APP_URL and are skipped if it's down.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, cleanupRun, createTenant, destroyTenant, runId, type Tenant } from "./helpers";

let A: Tenant;
let B: Tenant;
const admin = adminClient();
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Distinctive private values planted in workspace A (never allowed on public output).
const PRIVATE = {
  email: `private-${runId}@example.test`,
  phone: `+44 7000 ${runId.slice(0, 6)}`,
  note: `Confidential note ${runId}`,
  answer: `Raw private answer ${runId}`,
  budgetMarker: 987654,
  hiddenQuote: `Hidden quote ${runId}`,
  privateQuote: `Private quote ${runId}`,
};

let slugA = "";
let slugB = "";
let publishedTagged = "";
let publishedUntagged = "";
let hiddenId = "";
let serverUp = false;

beforeAll(async () => {
  A = await createTenant("p3a");
  B = await createTenant("p3b");
  const { data: wa } = await admin.from("workspaces").select("slug").eq("id", A.workspaceId).single();
  const { data: wb } = await admin.from("workspaces").select("slug").eq("id", B.workspaceId).single();
  slugA = wa!.slug;
  slugB = wb!.slug;

  // Plant private data on A's client, note, project and submission.
  await admin.from("clients").update({ emails: [PRIVATE.email], phone: PRIVATE.phone, whatsapp: PRIVATE.phone }).eq("id", A.ids.clients);
  await admin.from("client_notes").update({ body: PRIVATE.note }).eq("id", A.ids.client_notes);
  await admin.from("projects").update({ budget: PRIVATE.budgetMarker, notes: PRIVATE.note }).eq("id", A.ids.projects);
  await admin.from("submissions").update({ answers: { result: PRIVATE.answer }, contact: { email: PRIVATE.email } }).eq("id", A.ids.submissions);

  // A: the fixture testimonial (tagged "Shopify", in collection "stores") is published...
  publishedTagged = A.ids.testimonials;
  await admin
    .from("testimonials")
    .update({ visibility: "published", display_quote: `Tagged quote ${runId}`, display_name: "Ada", photo_url: `${A.workspaceId}/photos/a.webp` })
    .eq("id", publishedTagged);
  // ...plus one untagged published, one hidden and one private testimonial.
  const insert = async (quote: string, visibility: string) => {
    const { data } = await admin
      .from("testimonials")
      .insert({ workspace_id: A.workspaceId, source: "manual", display_quote: quote, visibility })
      .select("id")
      .single();
    return data!.id as string;
  };
  publishedUntagged = await insert(`Untagged quote ${runId}`, "published");
  hiddenId = await insert(PRIVATE.hiddenQuote, "hidden");
  await insert(PRIVATE.privateQuote, "private");
  await admin.from("collection_items").insert({ workspace_id: A.workspaceId, collection_id: A.ids.collections, testimonial_id: hiddenId, sort_order: 99 });

  // B publishes its own testimonial.
  await admin.from("testimonials").update({ visibility: "published", display_quote: `B quote ${runId}` }).eq("id", B.ids.testimonials);

  serverUp = await fetch(`${appUrl}/login`).then((r) => r.ok).catch(() => false);
});

afterAll(async () => {
  await destroyTenant(A);
  await destroyTenant(B);
  await cleanupRun();
});

const expectNoPrivate = (text: string) => {
  expect(text).not.toContain(PRIVATE.email);
  expect(text).not.toContain(PRIVATE.phone);
  expect(text).not.toContain(PRIVATE.note);
  expect(text).not.toContain(PRIVATE.answer);
  expect(text).not.toContain(String(PRIVATE.budgetMarker));
  expect(text).not.toContain(PRIVATE.hiddenQuote);
  expect(text).not.toContain(PRIVATE.privateQuote);
  expect(text).not.toMatch(/"budget"|"notes"|"emails"|"answers"|"contact"|photo_url|logo_url|proof_url/);
  // Storage paths look like "<workspace uuid>/…"
  expect(text).not.toContain(`${A.workspaceId}/`);
};

describe("public API (anon, SECURITY DEFINER functions)", () => {
  it("anon still cannot read tables directly", async () => {
    const { data } = await anonClient().from("testimonials").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("returns only published testimonials with public columns", async () => {
    const { data } = await anonClient().rpc("public_testimonials", { p_workspace: A.workspaceId });
    const rows = data as Record<string, unknown>[];
    expect(rows.map((r) => r.id).sort()).toEqual([publishedTagged, publishedUntagged].sort());
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["company", "date", "featured", "has_logo", "has_photo", "has_video", "has_video_thumb", "headline", "id", "name", "platform", "quote", "rating", "role", "sort_order", "tag_ids", "version"].sort(),
    );
    expect(rows.find((r) => r.id === publishedTagged)?.has_photo).toBe(true);
  });

  it("never mixes workspaces", async () => {
    const { data } = await anonClient().rpc("public_testimonials", { p_workspace: B.workspaceId });
    expect((data as { id: string }[]).map((r) => r.id)).toEqual([B.ids.testimonials]);
  });

  it("site, tags and collection responses hold no private data", async () => {
    const anon = anonClient();
    const [site, tests, tags, col] = await Promise.all([
      anon.rpc("public_site", { p_workspace: A.workspaceId }),
      anon.rpc("public_testimonials", { p_workspace: A.workspaceId }),
      anon.rpc("public_tags", { p_workspace: A.workspaceId }),
      anon.rpc("public_collection", { p_workspace: A.workspaceId, p_slug: "stores" }),
    ]);
    expectNoPrivate(JSON.stringify([site.data, tests.data, tags.data, col.data]));
  });

  it("collections only list published items", async () => {
    const { data } = await anonClient().rpc("public_collection", { p_workspace: A.workspaceId, p_slug: "stores" });
    expect((data as { testimonial_ids: string[] }).testimonial_ids).toEqual([publishedTagged]);
  });

  it("media paths are only released for published testimonials in their own workspace", async () => {
    const anon = anonClient();
    expect((await anon.rpc("public_media_path", { p_testimonial: publishedTagged, p_kind: "photo" })).data).toBe(`${A.workspaceId}/photos/a.webp`);
    expect((await anon.rpc("public_media_path", { p_testimonial: hiddenId, p_kind: "photo" })).data).toBeNull();
    expect((await anon.rpc("public_media_path", { p_testimonial: publishedTagged, p_kind: "proof" })).data).toBeNull();
  });

  it("a suspended workspace exposes nothing but its status", async () => {
    await admin.from("workspaces").update({ status: "suspended" }).eq("id", B.workspaceId);
    try {
      const anon = anonClient();
      expect((await anon.rpc("public_site", { p_workspace: B.workspaceId })).data).toBeNull();
      expect((await anon.rpc("public_testimonials", { p_workspace: B.workspaceId })).data).toEqual([]);
      const ws = (await anon.rpc("public_workspace", { p_slug: slugB })).data as { status: string }[];
      expect(ws[0].status).toBe("suspended");
    } finally {
      await admin.from("workspaces").update({ status: "active" }).eq("id", B.workspaceId);
    }
  });
});

describe("public pages over HTTP", () => {
  const get = (path: string) => fetch(`${appUrl}${path}`).then(async (r) => ({ status: r.status, text: await r.text() }));

  it("wall shows A's published testimonials and nothing private", async ({ skip }) => {
    if (!serverUp) skip();
    const { status, text } = await get(`/${slugA}`);
    expect(status).toBe(200);
    expect(text).toContain(`Tagged quote ${runId}`);
    expect(text).toContain(`Untagged quote ${runId}`);
    expect(text).not.toContain(`B quote ${runId}`);
    expectNoPrivate(text);
  });

  it("?tag= shows only matching testimonials (by name or id)", async ({ skip }) => {
    if (!serverUp) skip();
    for (const tag of ["shopify", "Shopify", A.ids.tags]) {
      const { text } = await get(`/${slugA}?tag=${encodeURIComponent(tag)}`);
      expect(text).toContain(`Tagged quote ${runId}`);
      expect(text).not.toContain(`Untagged quote ${runId}`);
    }
    const { text: none } = await get(`/${slugA}?tag=no-such-tag`);
    expect(none).not.toContain(`Tagged quote ${runId}`);
    expect(none).not.toContain(`Untagged quote ${runId}`);
  });

  it("search is reflected in the URL and filters results", async ({ skip }) => {
    if (!serverUp) skip();
    const { text } = await get(`/${slugA}?q=${encodeURIComponent("Untagged")}`);
    expect(text).toContain(`Untagged quote ${runId}`);
    expect(text).not.toContain(`Tagged quote ${runId}”`);
  });

  it("collection URL shows exactly its published testimonials", async ({ skip }) => {
    if (!serverUp) skip();
    const { status, text } = await get(`/${slugA}/c/stores`);
    expect(status).toBe(200);
    expect(text).toContain(`Tagged quote ${runId}`);
    expect(text).not.toContain(`Untagged quote ${runId}`);
    expectNoPrivate(text);
    expect((await get(`/${slugA}/c/no-such-collection`)).status).toBe(404);
  });

  it("single testimonial page works for published, 404 for hidden", async ({ skip }) => {
    if (!serverUp) skip();
    const ok = await get(`/${slugA}/t/view/${publishedTagged}`);
    expect(ok.status).toBe(200);
    expectNoPrivate(ok.text);
    expect((await get(`/${slugA}/t/view/${hiddenId}`)).status).toBe(404);
    // Another workspace's testimonial can't be viewed under this slug.
    expect((await get(`/${slugA}/t/view/${B.ids.testimonials}`)).status).toBe(404);
  });

  it("media route refuses hidden testimonials", async ({ skip }) => {
    if (!serverUp) skip();
    expect((await get(`/api/public/media/${hiddenId}/1/photo`)).status).toBe(404);
  });

  it("OG images render", async ({ skip }) => {
    if (!serverUp) skip();
    const r = await fetch(`${appUrl}/api/public/og/${slugA}/t/${publishedTagged}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("image/png");
  });
});
