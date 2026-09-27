/**
 * Phase 4b — widget, image cards, CSV import/export, full export, custom CSS.
 *  - The widget API returns one widget by (workspace public key, widget id) and nothing private.
 *  - The embed page can be framed by any site; everything else can't.
 *  - Image cards render at all three preset sizes (brief §9 Phase 4).
 *  - The full export contains every table and media link of ONE workspace (brief §9, §10).
 *  - CSV parsing/writing, client import validation, custom CSS checks.
 * HTTP checks run against the server at NEXT_PUBLIC_APP_URL and are skipped if it's down.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseCsv, csvCell, toCsv } from "@/lib/csv";
import { readClientRows, CLIENT_CSV_COLUMNS, clientExportRow } from "@/lib/clients-csv";
import { customCssProblem, parseTheme, scopedCustomCss } from "@/lib/site/config";
import { initialHeight, parseWidgetConfig, selectWidgetTestimonials, widgetSnippets } from "@/lib/widget/config";
import { collectWorkspaceData, EXPORT_TABLES, listWorkspaceFiles } from "@/lib/export";
import { CARD_SIZES, renderImageCard } from "@/lib/cards/image-card";
import type { PublicTestimonial } from "@/lib/site/types";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { adminClient, anonClient, cleanupRun, createTenant, destroyTenant, runId, type Tenant } from "./helpers";

let A: Tenant;
let B: Tenant;
const admin = adminClient();
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
let serverUp = false;
let keyA = "";
let keyB = "";
let widgetA = "";
let hiddenId = "";
const QUOTE = `Widget quote ${runId}`;

beforeAll(async () => {
  A = await createTenant("p4ba");
  B = await createTenant("p4bb");
  keyA = (await admin.from("workspaces").select("public_key").eq("id", A.workspaceId).single()).data!.public_key;
  keyB = (await admin.from("workspaces").select("public_key").eq("id", B.workspaceId).single()).data!.public_key;
  await admin.from("testimonials").update({ visibility: "published", display_quote: QUOTE, display_name: "Ada", featured: true }).eq("id", A.ids.testimonials);
  const { data: hidden } = await admin
    .from("testimonials")
    .insert({ workspace_id: A.workspaceId, source: "manual", display_quote: `Hidden ${runId}`, visibility: "hidden" })
    .select("id")
    .single();
  hiddenId = hidden!.id;
  await admin.from("collection_items").insert({ workspace_id: A.workspaceId, collection_id: A.ids.collections, testimonial_id: hiddenId, sort_order: 5 });
  // Owner creates a widget through RLS, like the dashboard does.
  const { data: w, error } = await A.client
    .from("widgets")
    .insert({ workspace_id: A.workspaceId, name: "Home", config: { layout: "grid", source: { type: "collection", id: A.ids.collections }, max_items: 6 } })
    .select("id")
    .single();
  if (error) throw error;
  widgetA = w.id;
  serverUp = await fetch(`${appUrl}/login`).then((r) => r.ok).catch(() => false);
});

afterAll(async () => {
  await admin.from("workspaces").update({ status: "active" }).eq("id", A.workspaceId);
  await destroyTenant(A);
  await destroyTenant(B);
  await cleanupRun();
});

// ---------- Widget ----------

describe("widget config", () => {
  const t = (id: string, extra: Partial<PublicTestimonial> = {}): PublicTestimonial => ({
    id, quote: id, headline: null, name: null, role: null, company: null, rating: 5, date: null, platform: null,
    photo: null, logo: null, video: null, videoThumb: null, featured: false, tagIds: [], ...extra,
  });
  const all = [t("a", { featured: true, tagIds: ["x"] }), t("b"), t("c", { tagIds: ["x"] })];

  it("falls back to safe defaults for bad input", () => {
    const c = parseWidgetConfig({ layout: "evil", max_items: 999, theme: 3, source: { type: "tag", id: "not-a-uuid" } });
    expect(c.layout).toBe("grid");
    expect(c.max_items).toBe(9);
    expect(c.theme).toBe("site");
    expect(c.source.id).toBeNull();
  });

  it("selects by source, keeps collection order and respects max items", () => {
    const base = parseWidgetConfig({});
    expect(selectWidgetTestimonials(all, { ...base, source: { type: "featured", id: null } }, null).map((x) => x.id)).toEqual(["a"]);
    expect(selectWidgetTestimonials(all, { ...base, source: { type: "tag", id: "x" as never } }, null).map((x) => x.id)).toEqual(["a", "c"]);
    expect(selectWidgetTestimonials(all, { ...base, source: { type: "collection", id: null } }, ["c", "zz", "a"]).map((x) => x.id)).toEqual(["c", "a"]);
    expect(selectWidgetTestimonials(all, { ...base, max_items: 2 }, null)).toHaveLength(2);
    expect(selectWidgetTestimonials(all, { ...base, layout: "single" }, null)).toHaveLength(1);
  });

  it("snippets carry the public key, never the workspace id", () => {
    const s = widgetSnippets("https://app.test", keyA, widgetA, parseWidgetConfig({}));
    expect(s.script).toContain(`data-testimonial-widget="${keyA}/${widgetA}"`);
    expect(s.iframe).toContain(`/embed/${keyA}/${widgetA}`);
    expect(s.script + s.iframe).not.toContain(A.workspaceId);
    expect(initialHeight(parseWidgetConfig({ layout: "badge" }))).toBeLessThan(100);
  });
});

describe("public_widget (anon)", () => {
  it("returns the widget for the right key, with only published collection items", async () => {
    const { data } = await anonClient().rpc("public_widget", { p_key: keyA, p_widget: widgetA });
    expect(data.workspace.id).toBe(A.workspaceId);
    expect(data.config.layout).toBe("grid");
    expect(data.collection_ids).toEqual([A.ids.testimonials]);
    expect(JSON.stringify(data)).not.toContain(hiddenId);
  });

  it("returns nothing for another workspace's key or a made-up id", async () => {
    const anon = anonClient();
    expect((await anon.rpc("public_widget", { p_key: keyB, p_widget: widgetA })).data).toBeNull();
    expect((await anon.rpc("public_widget", { p_key: keyA, p_widget: "00000000-0000-0000-0000-000000000000" })).data).toBeNull();
  });

  it("anon still can't read the widgets table directly", async () => {
    const { data } = await anonClient().from("widgets").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("another owner can't read or edit the widget", async () => {
    expect((await B.client.from("widgets").select("id").eq("id", widgetA)).data).toEqual([]);
    await B.client.from("widgets").update({ name: "pwned" }).eq("id", widgetA);
    expect((await admin.from("widgets").select("name").eq("id", widgetA).single()).data!.name).toBe("Home");
  });
});

describe("embed over HTTP", () => {
  it("renders the widget, frameable anywhere, with nothing private", async ({ skip }) => {
    if (!serverUp) skip();
    const res = await fetch(`${appUrl}/embed/${keyA}/${widgetA}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors *");
    const html = await res.text();
    expect(html).toContain(QUOTE);
    expect(html).not.toContain(`Hidden ${runId}`);
    expect(html).not.toContain("Secret answer");
    expect(html).not.toContain("secret-p4ba@example.test");
  });

  it("the rest of the app can't be framed", async ({ skip }) => {
    if (!serverUp) skip();
    expect((await fetch(`${appUrl}/login`)).headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("serves the loader script and 404s bad ids", async ({ skip }) => {
    if (!serverUp) skip();
    const js = await fetch(`${appUrl}/widget.js`);
    expect(js.headers.get("content-type")).toContain("javascript");
    const source = await js.text();
    expect(source).toContain("data-testimonial-widget");
    // The loader is built from a template string; make sure what we serve is valid JavaScript.
    expect(() => new Function(source)).not.toThrow();
    expect((await fetch(`${appUrl}/embed/${keyB}/${widgetA}`)).status).toBe(404);
    expect((await fetch(`${appUrl}/embed/not-a-key/${widgetA}`)).status).toBe(404);
  });

  it("a suspended workspace exposes only its status (the embed shows a neutral message)", async () => {
    await admin.from("workspaces").update({ status: "suspended" }).eq("id", A.workspaceId);
    const { data } = await anonClient().rpc("public_widget", { p_key: keyA, p_widget: widgetA });
    expect(data.workspace.status).toBe("suspended");
    expect(data.config).toBeNull();
    expect(data.collection_ids).toBeNull();
    await admin.from("workspaces").update({ status: "active" }).eq("id", A.workspaceId);
  });
});

// ---------- Custom CSS ----------

describe("custom CSS", () => {
  it("accepts ordinary CSS and scopes it to the public page", () => {
    const css = ".tc-card { border-width: 2px; } h1 { letter-spacing: -0.02em; background: url(https://example.com/a.png); }";
    expect(customCssProblem(css)).toBeNull();
    expect(scopedCustomCss(css, ".tc-site")).toBe(`.tc-site{${css}}`);
  });

  it.each([
    ["</style><script>alert(1)</script>", "<"],
    ["@import url(https://evil.test/x.css);", "@import"],
    ["a { background: url(javascript:alert(1)) }", "allowed"],
    ["a { background: url(http://insecure.test/x.png) }", "https"],
    ["a { width: expression(alert(1)) }", "allowed"],
    ["a { color: red } }", "unmatched"],
    ["\\40 import url(x)", "Backslash"],
  ])("rejects %s", (css, hint) => {
    const problem = customCssProblem(css);
    expect(problem).not.toBeNull();
    expect(problem!.toLowerCase()).toContain(hint.toLowerCase());
    expect(scopedCustomCss(css, ".tc-site")).toBe("");
  });

  it("is part of the theme and survives parsing", () => {
    expect(parseTheme({ custom_css: "a{color:red}" }).custom_css).toBe("a{color:red}");
    expect(parseTheme({}).custom_css).toBe("");
  });
});

// ---------- CSV ----------

describe("CSV", () => {
  it("parses quotes, commas, newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿name,note\r\n"Blake, Jordan","said ""hi""\nthere"\r\n\r\nAda,x\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Blake, Jordan", 'said "hi"\nthere'],
      ["Ada", "x"],
    ]);
  });

  it("neutralises spreadsheet formulas on export", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("+44 7000")).toBe("'+44 7000");
    expect(csvCell("@user")).toBe("'@user");
    expect(csvCell("plain")).toBe("plain");
    expect(toCsv(["a"], [["x,y"]])).toBe('﻿a\r\n"x,y"\r\n');
  });
});

describe("client CSV import", () => {
  const defs: CustomFieldDef[] = [{ id: "1", entity: "client", key: "team_size", label: "Team size", type: "number", options: [] }];
  const header = ["Name", "Emails", "Company", "Source", "Status", "Tags", "Team size", "Favourite colour", "phone"];

  it("reads valid rows, custom fields and tags; ignores unknown columns", () => {
    const r = readClientRows(
      [header, ["Jordan Blake", "JB@Example.com; jordan@work.test", "Northwind", "Upwork", "Active", "Shopify; Retail", "12", "blue", "'+44 7000"]],
      defs,
      new Map(),
    );
    expect(r.error).toBeUndefined();
    expect(r.unknownColumns).toEqual(["Favourite colour"]);
    const c = r.rows[0].client!;
    expect(c.emails).toEqual(["jb@example.com", "jordan@work.test"]);
    expect(c.source).toBe("upwork");
    expect(c.custom_fields).toEqual({ team_size: 12 });
    expect(c.tags).toEqual(["Shopify", "Retail"]);
    expect(c.phone).toBe("+44 7000"); // the export's formula guard is undone
  });

  it("reports row problems with line numbers", () => {
    const r = readClientRows([header, ["", "x@y.test"], ["Bad", "not-an-email"], ["Bad2", "", "", "fiverr"], ["Bad3", "", "", "", "", "", "many"]], defs, new Map());
    expect(r.rows.map((x) => x.line)).toEqual([2, 3, 4, 5]);
    expect(r.rows.every((x) => !x.client && x.errors.length)).toBe(true);
    expect(r.rows[2].errors.join()).toMatch(/source/);
    expect(r.rows[3].errors.join()).toMatch(/Team size/);
  });

  it("flags duplicates of existing clients and within the file", () => {
    const r = readClientRows(
      [["name", "email"], ["A", "a@x.test"], ["B", "b@x.test"], ["B again", "B@x.test"]],
      [],
      new Map([["a@x.test", "existing client “A”"]]),
    );
    expect(r.rows[0].duplicateOf).toContain("existing client");
    expect(r.rows[1].duplicateOf).toBeUndefined();
    expect(r.rows[2].duplicateOf).toBe("row 3 of this file");
  });

  it("requires a name column and caps the size", () => {
    expect(readClientRows([["email"], ["a@b.test"]], [], new Map()).error).toMatch(/name/);
    expect(readClientRows([["name"], ...Array.from({ length: 2001 }, () => ["x"])], [], new Map()).error).toMatch(/2000/);
  });

  it("export rows round-trip through import", () => {
    const row = clientExportRow(
      { name: "Round Trip", emails: ["rt@x.test"], source: "referral", status: "past", phone: "+1 555", custom_fields: { team_size: 3 } },
      ["VIP"],
      defs,
    );
    const csv = toCsv([...CLIENT_CSV_COLUMNS, "team_size"], [row]);
    const back = readClientRows(parseCsv(csv), defs, new Map()).rows[0].client!;
    expect(back).toMatchObject({ name: "Round Trip", emails: ["rt@x.test"], source: "referral", status: "past", phone: "+1 555", tags: ["VIP"], custom_fields: { team_size: 3 } });
  });
});

// ---------- Full export ----------

describe("full data export", () => {
  it("includes every table and only this workspace's rows, without secrets", async () => {
    const data = await collectWorkspaceData(A.client);
    expect(Object.keys(data).sort()).toEqual([...EXPORT_TABLES].sort());
    for (const table of EXPORT_TABLES) {
      expect(data[table].length, table).toBeGreaterThan(0);
      for (const row of data[table]) expect(row.workspace_id, table).toBe(A.workspaceId);
    }
    const text = JSON.stringify(data);
    expect(text).not.toContain(B.workspaceId);
    expect(text).not.toContain(A.token); // request tokens are left out
    expect(data.requests[0]).not.toHaveProperty("token");
  });

  it("lists this workspace's files only", async () => {
    const files = await listWorkspaceFiles(A.client, A.workspaceId);
    expect(files.map((f) => f.path)).toContain(A.filePath);
    expect(files.every((f) => f.path.startsWith(`${A.workspaceId}/`))).toBe(true);
    // Asking for another workspace's folder returns nothing (storage policies).
    expect(await listWorkspaceFiles(A.client, B.workspaceId)).toEqual([]);
  });
});

// ---------- Image cards ----------

describe("image cards", () => {
  const input = { quote: "They rebuilt our store in three weeks and sales went up 30%.", headline: "Launched in 3 weeks", name: "Ada Lovelace", role: "Founder", company: "Engines Ltd", rating: 5, photo: null, siteName: "Sam Rivera" };

  it.each(Object.entries(CARD_SIZES))("renders %s at the preset size", async (size, dims) => {
    const res = await renderImageCard(input, parseTheme({}), size as keyof typeof CARD_SIZES, "classic");
    const png = Buffer.from(await res.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(dims.width);
    expect(png.readUInt32BE(20)).toBe(dims.height);
  }, 30_000);

  it("renders every design", async () => {
    for (const design of ["classic", "bold", "minimal"] as const) {
      const res = await renderImageCard({ ...input, quote: "x".repeat(600) }, parseTheme({ mode: "dark" }), "square", design);
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    }
  }, 60_000);
});
