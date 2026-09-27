/**
 * Phase 4a — video testimonials and client approval.
 *  - Video is only publishable with Full consent; withdrawing consent unpublishes it (database rules).
 *  - Video / thumbnail paths must belong to the workspace.
 *  - The public media API serves video only for published testimonials.
 *  - The storage bucket accepts video uploads through signed upload URLs.
 *  - Approval links: unknown tokens are rejected, the page is noindex/no-referrer, the quote shows.
 * HTTP checks run against the server at NEXT_PUBLIC_APP_URL and are skipped if it's down.
 */
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isVerbatimQuote, videoDownloadName } from "@/lib/approval";
import { needsReminderFilter } from "@/lib/requests";
import { buildSteps, validateStep } from "@/lib/form/steps";
import type { TemplateSnapshot } from "@/lib/form/types";
import { adminClient, anonClient, cleanupRun, createTenant, destroyTenant, runId, type Tenant } from "./helpers";

let A: Tenant;
let B: Tenant;
const admin = adminClient();
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
let serverUp = false;
let videoPath = "";
let thumbPath = "";

// Smallest valid-looking WebM header; storage only checks the declared type and size.
const WEBM = Buffer.from("1a45dfa3a34286810142f7810142f2810442f381084282847765626d42878102428581021853806701ffffffffffffff", "hex");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

beforeAll(async () => {
  A = await createTenant("p4a");
  B = await createTenant("p4b");
  videoPath = `${A.workspaceId}/submissions/${A.ids.submissions}/video-test.webm`;
  thumbPath = `${A.workspaceId}/submissions/${A.ids.submissions}/thumb-test.png`;
  await admin.storage.from("uploads").upload(videoPath, WEBM, { contentType: "video/webm" });
  await admin.storage.from("uploads").upload(thumbPath, PNG, { contentType: "image/png" });
  await admin
    .from("submissions")
    .update({ consent_level: "full", video_url: videoPath, video_thumbnail_url: thumbPath, submitted_at: new Date().toISOString() })
    .eq("id", A.ids.submissions);
  serverUp = await fetch(`${appUrl}/login`).then((r) => r.ok).catch(() => false);
});

afterAll(async () => {
  // Remove the videos and thumbnails this suite uploaded (destroyTenant only knows its own fixture file).
  const folder = `${A.workspaceId}/submissions/${A.ids.submissions}`;
  const { data: files } = await admin.storage.from("uploads").list(folder, { limit: 100 });
  if (files?.length) await admin.storage.from("uploads").remove(files.map((f) => `${folder}/${f.name}`));
  await destroyTenant(A);
  await destroyTenant(B);
  await cleanupRun();
});

describe("video consent rules (database)", () => {
  it("publishes a video with Full consent", async () => {
    const { error } = await A.client
      .from("testimonials")
      .update({ visibility: "published", video_url: videoPath, video_thumbnail_url: thumbPath })
      .eq("id", A.ids.testimonials);
    expect(error).toBeNull();
  });

  it("serves the published video and thumbnail paths through the public API only", async () => {
    const anon = anonClient();
    const { data: v } = await anon.rpc("public_media_path", { p_testimonial: A.ids.testimonials, p_kind: "video" });
    const { data: th } = await anon.rpc("public_media_path", { p_testimonial: A.ids.testimonials, p_kind: "video_thumb" });
    expect(v).toBe(videoPath);
    expect(th).toBe(thumbPath);
    const { data: list } = await anon.rpc("public_testimonials", { p_workspace: A.workspaceId });
    const row = (list as { id: string; has_video: boolean; has_video_thumb: boolean }[]).find((r) => r.id === A.ids.testimonials);
    expect(row?.has_video).toBe(true);
    expect(row?.has_video_thumb).toBe(true);
    // Public rows never carry storage paths.
    expect(JSON.stringify(list)).not.toContain(videoPath);
  });

  it("unpublishes the video testimonial when consent drops to Partial", async () => {
    await admin.from("submissions").update({ consent_level: "partial" }).eq("id", A.ids.submissions);
    const { data } = await admin.from("testimonials").select("visibility").eq("id", A.ids.testimonials).single();
    expect(data!.visibility).toBe("hidden");
    const { data: v } = await anonClient().rpc("public_media_path", { p_testimonial: A.ids.testimonials, p_kind: "video" });
    expect(v).toBeNull();
  });

  it("refuses to publish a video with Partial consent", async () => {
    const { error } = await A.client
      .from("testimonials")
      .update({ visibility: "published", display_name: "Ada", display_company: null })
      .eq("id", A.ids.testimonials);
    expect(error?.message).toMatch(/consent_violation: Video/);
  });

  it("publishes the same testimonial without the video", async () => {
    const { error } = await A.client
      .from("testimonials")
      .update({ visibility: "published", video_url: null, video_thumbnail_url: null, display_name: "Ada", display_company: null })
      .eq("id", A.ids.testimonials);
    expect(error).toBeNull();
  });

  it("rejects video paths from another workspace", async () => {
    const foreign = `${B.workspaceId}/submissions/${B.ids.submissions}/video-x.webm`;
    const { error } = await A.client.from("testimonials").update({ video_url: foreign }).eq("id", A.ids.testimonials);
    expect(error?.message).toMatch(/video_url must be a file in this workspace/);
    const { error: e2 } = await A.client.from("testimonials").update({ video_thumbnail_url: foreign }).eq("id", A.ids.testimonials);
    expect(e2?.message).toMatch(/video_thumbnail_url must be a file in this workspace/);
  });

  it("owners still can't rewrite the client's submitted video", async () => {
    const { error } = await A.client.from("submissions").update({ video_url: null }).eq("id", A.ids.submissions);
    expect(error).not.toBeNull();
  });
});

describe("video storage", () => {
  it("accepts a video through a signed upload URL", async () => {
    const path = `${A.workspaceId}/submissions/${A.ids.submissions}/video-signed-${runId}.webm`;
    const { data, error } = await admin.storage.from("uploads").createSignedUploadUrl(path);
    expect(error).toBeNull();
    const res = await fetch(data!.signedUrl, { method: "PUT", headers: { "content-type": "video/webm" }, body: WEBM });
    expect(res.ok).toBe(true);
    const { data: listed } = await admin.storage.from("uploads").list(`${A.workspaceId}/submissions/${A.ids.submissions}`, { search: `video-signed-${runId}` });
    expect(listed?.[0]?.metadata?.mimetype).toBe("video/webm");
  });

  it("rejects file types the bucket doesn't allow", async () => {
    const path = `${A.workspaceId}/submissions/${A.ids.submissions}/evil-${runId}.html`;
    const { data } = await admin.storage.from("uploads").createSignedUploadUrl(path);
    const res = await fetch(data!.signedUrl, { method: "PUT", headers: { "content-type": "text/html" }, body: "<script>alert(1)</script>" });
    expect(res.ok).toBe(false);
  });
});

describe("video step in the form engine", () => {
  const snapshot = {
    version: 2,
    items: [{ key: "q1", section: "question", type: "long_text", label: "How did it go?", shown: true, required: false }],
    settings: { rating_enabled: false, video_enabled: true, video_required: true, video_max_seconds: 90, video_max_mb: 100 },
    copy: {},
  } as unknown as TemplateSnapshot;

  it("adds a video step after the questions", () => {
    const kinds = buildSteps(snapshot).map((s) => s.kind);
    expect(kinds.indexOf("video")).toBeGreaterThan(kinds.indexOf("question"));
  });

  it("requires a video when the template says so", () => {
    const step = buildSteps(snapshot).find((s) => s.kind === "video")!;
    const values = { rating: null, answers: {}, about: {}, contact: {}, consent_level: null, video_path: null };
    expect(validateStep(step, values as never, snapshot).video).toBeTruthy();
    expect(validateStep(step, { ...values, video_path: "x" } as never, snapshot).video).toBeUndefined();
  });
});

describe("approval helpers", () => {
  const answers = ["The team was fast and friendly. We launched in three weeks! Support was great."];
  it("treats selected sentences as the client's own words", () => {
    expect(isVerbatimQuote("We launched in three weeks! The team was fast and friendly.", answers)).toBe(true);
    expect(isVerbatimQuote("  we launched in three weeks  ", answers)).toBe(true);
  });
  it("flags reworded quotes", () => {
    expect(isVerbatimQuote("We launched in just two weeks.", answers)).toBe(false);
    expect(isVerbatimQuote("The team was fast and friendly. Best agency ever.", answers)).toBe(false);
  });
  it("builds a readable download filename", () => {
    expect(videoDownloadName("Jördan Blake", "2026-09-27T10:00:00Z", "ws/x/video-abc.mp4")).toBe("jordan-blake-testimonial-2026-09-27.mp4");
    expect(videoDownloadName("", null, "ws/x/video")).toBe("client-testimonial-video.webm");
  });
});

describe("needs-a-reminder filter", () => {
  it("counts from the last reminder, or from sending", async () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const recent = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString();
    await admin.from("requests").update({ status: "sent", sent_at: old, last_reminded_at: recent }).eq("id", A.ids.requests);
    const q = () => A.client.from("requests").select("id").in("status", ["sent", "opened", "in_progress"]).or(needsReminderFilter(cutoff));
    expect((await q()).data).toEqual([]);
    await admin.from("requests").update({ last_reminded_at: null }).eq("id", A.ids.requests);
    expect((await q()).data).toEqual([{ id: A.ids.requests }]);
    await admin.from("requests").update({ last_reminded_at: old }).eq("id", A.ids.requests);
    expect((await q()).data).toEqual([{ id: A.ids.requests }]);
  });
});

describe("approval page (HTTP)", () => {
  const token = randomBytes(24).toString("base64url");
  const quote = `Approved wording ${runId}`;

  beforeAll(async () => {
    await admin
      .from("testimonials")
      .update({
        display_quote: quote,
        approval_status: "pending",
        approval_quote: quote,
        approval_token_hash: createHash("sha256").update(token).digest("hex"),
        approval_requested_at: new Date().toISOString(),
      })
      .eq("id", A.ids.testimonials);
  });

  it("shows the quote for a valid token, with noindex and no-referrer headers", async ({ skip }) => {
    if (!serverUp) skip();
    const res = await fetch(`${appUrl}/a/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await res.text();
    expect(html).toContain(quote);
    expect(html).toContain("Approve");
    // Nothing private leaks onto the page.
    expect(html).not.toContain("Secret answer");
    expect(html).not.toContain("secret-p4a@example.test");
  });

  it("rejects unknown and malformed tokens", async ({ skip }) => {
    if (!serverUp) skip();
    for (const t of [randomBytes(24).toString("base64url"), "short", "../../etc"]) {
      const html = await fetch(`${appUrl}/a/${encodeURIComponent(t)}`).then((r) => r.text());
      expect(html).toContain("Link not found");
      expect(html).not.toContain(quote);
    }
  });

  it("stops working when the request expires", async ({ skip }) => {
    if (!serverUp) skip();
    await admin
      .from("testimonials")
      .update({ approval_requested_at: new Date(Date.now() - 31 * 86_400_000).toISOString() })
      .eq("id", A.ids.testimonials);
    const html = await fetch(`${appUrl}/a/${token}`).then((r) => r.text());
    expect(html).toContain("Link expired");
    expect(html).not.toContain(quote);
  });
});

describe("public video media route (HTTP)", () => {
  it("redirects to a signed URL only while published with Full consent", async ({ skip }) => {
    if (!serverUp) skip();
    await admin.from("submissions").update({ consent_level: "full" }).eq("id", A.ids.submissions);
    await admin
      .from("testimonials")
      .update({ visibility: "published", video_url: videoPath, video_thumbnail_url: thumbPath })
      .eq("id", A.ids.testimonials);
    const res = await fetch(`${appUrl}/api/public/media/${A.ids.testimonials}/1/video`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/\/storage\/v1\/object\/sign\/uploads\//);
    expect(res.headers.get("cache-control")).toContain("no-store");

    const thumb = await fetch(`${appUrl}/api/public/media/${A.ids.testimonials}/1/video_thumb`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toMatch(/^image\//);

    await admin.from("testimonials").update({ visibility: "hidden" }).eq("id", A.ids.testimonials);
    const hidden = await fetch(`${appUrl}/api/public/media/${A.ids.testimonials}/2/video`, { redirect: "manual" });
    expect(hidden.status).toBe(404);
  });

  it("rejects unknown media kinds", async ({ skip }) => {
    if (!serverUp) skip();
    const res = await fetch(`${appUrl}/api/public/media/${A.ids.testimonials}/1/contact`);
    expect(res.status).toBe(404);
  });
});

describe("video size limit (free plan: 50 MB)", () => {
  it("defaults to the free-plan limit", async () => {
    const { VIDEO_STORAGE_MAX_MB } = await import("@/lib/video-limits");
    expect(VIDEO_STORAGE_MAX_MB).toBe(Number(process.env.NEXT_PUBLIC_VIDEO_MAX_MB) || 50);
  });

  it("picks a bitrate so a full-length recording fits under the limit", async () => {
    const { recordingBitrate } = await import("@/lib/video-limits");
    for (const [mb, secs] of [[50, 90], [50, 300], [20, 300], [100, 90]] as const) {
      const bps = recordingBitrate(mb, secs);
      const bytes = ((bps + 96_000) * secs) / 8;
      expect(bytes).toBeLessThan(mb * 1024 * 1024);
      expect(bps).toBeLessThanOrEqual(2_000_000);
    }
    expect(recordingBitrate(50, 90)).toBe(2_000_000);
  });
});
