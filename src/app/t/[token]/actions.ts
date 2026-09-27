"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRequestByToken, type LoadedRequest } from "@/lib/public-form";
import { consentText, sanitizeValues, validateAll } from "@/lib/form/steps";
import type { FormValues } from "@/lib/form/types";
import { clientIp, ipHash, randomToken } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { storeImage, UploadError } from "@/lib/uploads";
import { revalidateSite } from "@/lib/site/cache";

type Result = { ok: true } | { ok: false; error: string; closed?: boolean; fieldErrors?: Record<string, string> };

async function openRequest(token: string, bucket: string, limit: number): Promise<LoadedRequest | Result> {
  const ip = await clientIp();
  if (!rateLimit(`${bucket}:${ip}`, limit, 60_000) || !rateLimit(`${bucket}:t:${token}`, limit, 60_000)) {
    return { ok: false, error: "Too many requests. Wait a moment and try again." };
  }
  const loaded = await loadRequestByToken(token);
  if (loaded.state !== "ok") {
    return { ok: false, closed: true, error: loaded.state === "submitted" ? "This form was already submitted." : "This link is no longer active." };
  }
  return loaded.request;
}

async function ensureSubmission(request: LoadedRequest): Promise<string> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("submissions").select("id").eq("request_id", request.id).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await admin
    .from("submissions")
    .upsert({ workspace_id: request.workspace_id, request_id: request.id }, { onConflict: "request_id" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Keep only image values that point at this submission's own folder. */
function scrubImagePaths(values: FormValues, request: LoadedRequest, submissionId: string) {
  const prefix = `${request.workspace_id}/submissions/${submissionId}/`;
  for (const item of request.template_snapshot.items) {
    if (item.type !== "image" || item.section === "question") continue;
    const bucket = values[item.section];
    const v = bucket[item.key];
    if (typeof v === "string" && v && !v.startsWith(prefix) && v !== item.prefill_value) bucket[item.key] = null;
  }
}

/** Autosave after each step so the client can close the tab and resume later. */
export async function saveProgress(token: string, step: number, input: Partial<FormValues>): Promise<Result> {
  const request = await openRequest(token, "save", 60);
  if ("ok" in request) return request;

  const values = sanitizeValues(input, request.template_snapshot);
  const submissionId = await ensureSubmission(request);
  scrubImagePaths(values, request, submissionId);

  const admin = createAdminClient();
  await admin
    .from("submissions")
    .update({
      rating: values.rating,
      answers: values.answers,
      about: values.about,
      contact: values.contact,
      consent_level: values.consent_level,
      progress_step: Math.max(0, Math.min(50, Math.floor(step))),
    })
    .eq("id", submissionId)
    .is("submitted_at", null);

  if (!request.started_at) {
    const now = new Date().toISOString();
    await admin
      .from("requests")
      .update({ status: "in_progress", started_at: now, opened_at: request.opened_at ?? now })
      .eq("id", request.id)
      .in("status", ["draft", "sent", "opened"]);
    await admin.from("activity_log").insert({
      workspace_id: request.workspace_id,
      client_id: request.client_id,
      entity_type: "request",
      entity_id: request.id,
      action: "started",
    });
  }
  return { ok: true };
}

export type UploadResult = { ok: true; path: string; url: string } | { ok: false; error: string };

export async function uploadFormImage(token: string, itemKey: string, formData: FormData): Promise<UploadResult> {
  const request = await openRequest(token, "upload", 10);
  if ("ok" in request) return { ok: false, error: request.ok ? "Upload failed." : request.error };

  const item = request.template_snapshot.items.find((i) => i.key === itemKey && i.type === "image");
  if (!item || !item.shown || item.prefill_locked) return { ok: false, error: "This field doesn't accept uploads." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };

  const submissionId = await ensureSubmission(request);
  const admin = createAdminClient();
  try {
    const square = item.maps_to_client_field === "photo_url" || item.key === "photo";
    const path = await storeImage(admin, request.workspace_id, `submissions/${submissionId}`, file, { square });
    const { data } = await admin.storage.from("uploads").createSignedUrl(path, 3600);
    return { ok: true, path, url: data?.signedUrl ?? "" };
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function submitForm(token: string, input: Partial<FormValues>, honeypot: string): Promise<Result> {
  const request = await openRequest(token, "submit", 10);
  if ("ok" in request) return request;

  const snapshot = request.template_snapshot;
  const values = sanitizeValues(input, snapshot);
  const submissionId = await ensureSubmission(request);
  scrubImagePaths(values, request, submissionId);

  // Bots fill the hidden field. Pretend it worked and store nothing.
  if (honeypot) return { ok: true };

  // The video (if any) is whatever the server recorded after upload — never the browser's claim.
  const { data: current } = await createAdminClient().from("submissions").select("video_url").eq("id", submissionId).single();
  values.video_path = snapshot.settings.video_enabled ? (current?.video_url ?? null) : null;

  const errors = validateAll(values, snapshot);
  if (Object.keys(errors).length) {
    return { ok: false, error: "Some answers need attention.", fieldErrors: errors };
  }

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const h = await headers();
  const { data: updated } = await admin
    .from("submissions")
    .update({
      rating: values.rating,
      answers: values.answers,
      about: values.about,
      contact: values.contact,
      consent_level: values.consent_level,
      consent_text: consentText(snapshot, values.consent_level!),
      consent_at: now,
      submitted_at: now,
      merge_status: "pending",
      ip_hash: await ipHash(),
      user_agent: (h.get("user-agent") ?? "").slice(0, 300),
    })
    .eq("id", submissionId)
    .is("submitted_at", null)
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: false, closed: true, error: "This form was already submitted." };

  await admin
    .from("requests")
    .update({
      status: "submitted",
      submitted_at: now,
      started_at: request.started_at ?? now,
      opened_at: request.opened_at ?? now,
    })
    .eq("id", request.id);
  await admin.from("activity_log").insert({
    workspace_id: request.workspace_id,
    client_id: request.client_id,
    entity_type: "request",
    entity_id: request.id,
    action: "submitted",
    meta: { submission_id: submissionId, consent_level: values.consent_level },
  });
  revalidateSite(request.workspace_id);
  return { ok: true };
}

// ---------- Video (brief §3.4) --------------------------------------------

const VIDEO_TYPES: Record<string, string> = { "video/webm": "webm", "video/mp4": "mp4", "video/quicktime": "mov" };

function videoFolder(request: LoadedRequest, submissionId: string) {
  return `${request.workspace_id}/submissions/${submissionId}`;
}

export type VideoUploadStart = { ok: true; url: string; path: string } | { ok: false; error: string };

/**
 * Issue a one-time signed upload URL for this submission's video. The browser uploads straight to
 * storage (with progress) so large files never pass through the app server.
 */
export async function startVideoUpload(token: string, input: { size: number; type: string; duration: number | null }): Promise<VideoUploadStart> {
  const request = await openRequest(token, "video", 10);
  if ("ok" in request) return { ok: false, error: request.ok ? "Upload failed." : request.error };
  const s = request.template_snapshot.settings;
  if (!s.video_enabled) return { ok: false, error: "This form doesn't accept video." };

  const type = String(input.type).split(";")[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[type];
  if (!ext) return { ok: false, error: "Upload an MP4, MOV or WebM video." };
  const maxBytes = (s.video_max_mb ?? 100) * 1024 * 1024;
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > maxBytes) {
    return { ok: false, error: `Videos must be ${s.video_max_mb ?? 100} MB or smaller.` };
  }
  const maxSeconds = s.video_max_seconds ?? 90;
  if (input.duration !== null && Number.isFinite(input.duration) && input.duration > maxSeconds + 2) {
    return { ok: false, error: `Videos can be up to ${maxSeconds} seconds long.` };
  }

  const submissionId = await ensureSubmission(request);
  const path = `${videoFolder(request, submissionId)}/video-${randomToken(9)}.${ext}`;
  const { data, error } = await createAdminClient().storage.from("uploads").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Couldn't start the upload. Try again." };
  return { ok: true, url: data.signedUrl, path };
}

export type VideoFinish = { ok: true; url: string | null } | { ok: false; error: string };

/** Verify the uploaded object and attach it (plus a thumbnail frame) to the submission. */
export async function finishVideoUpload(token: string, path: string, formData: FormData): Promise<VideoFinish> {
  const request = await openRequest(token, "video", 20);
  if ("ok" in request) return { ok: false, error: request.ok ? "Upload failed." : request.error };
  if (!request.template_snapshot.settings.video_enabled) return { ok: false, error: "This form doesn't accept video." };

  const submissionId = await ensureSubmission(request);
  const folder = videoFolder(request, submissionId);
  const name = path.slice(folder.length + 1);
  if (!path.startsWith(`${folder}/video-`) || name.includes("/")) return { ok: false, error: "Unknown upload." };

  const admin = createAdminClient();
  const { data: files } = await admin.storage.from("uploads").list(folder, { search: name, limit: 5 });
  const object = files?.find((f) => f.name === name);
  const size = Number((object?.metadata as { size?: number } | undefined)?.size ?? 0);
  const mime = String((object?.metadata as { mimetype?: string } | undefined)?.mimetype ?? "");
  const maxBytes = (request.template_snapshot.settings.video_max_mb ?? 100) * 1024 * 1024;
  if (!object || size <= 0 || size > maxBytes || !mime.startsWith("video/")) {
    if (object) await admin.storage.from("uploads").remove([path]);
    return { ok: false, error: "The upload didn't complete. Please try again." };
  }

  // Optional thumbnail frame captured in the browser; re-encoded (and EXIF-free) like every image.
  let thumbPath: string | null = null;
  const thumb = formData.get("thumbnail");
  if (thumb instanceof File && thumb.size > 0) {
    try {
      thumbPath = await storeImage(admin, request.workspace_id, `submissions/${submissionId}`, thumb, { maxSize: 640 });
    } catch (e) {
      if (!(e instanceof UploadError)) throw e;
    }
  }

  const { data: previous } = await admin.from("submissions").select("video_url, video_thumbnail_url").eq("id", submissionId).single();
  const { error } = await admin
    .from("submissions")
    .update({ video_url: path, video_thumbnail_url: thumbPath })
    .eq("id", submissionId)
    .is("submitted_at", null);
  if (error) return { ok: false, error: "Couldn't save the video. Try again." };

  const stale = [previous?.video_url, previous?.video_thumbnail_url].filter((p): p is string => !!p && p.startsWith(`${folder}/`) && p !== path);
  if (stale.length) await admin.storage.from("uploads").remove(stale);

  const { data: signed } = await admin.storage.from("uploads").createSignedUrl(path, 3600);
  return { ok: true, url: signed?.signedUrl ?? null };
}

export async function removeVideo(token: string): Promise<{ ok: boolean }> {
  const request = await openRequest(token, "video", 20);
  if ("ok" in request) return { ok: false };
  const admin = createAdminClient();
  const { data: sub } = await admin.from("submissions").select("id, video_url, video_thumbnail_url").eq("request_id", request.id).maybeSingle();
  if (!sub) return { ok: true };
  await admin.from("submissions").update({ video_url: null, video_thumbnail_url: null }).eq("id", sub.id).is("submitted_at", null);
  const folder = videoFolder(request, sub.id);
  const files = [sub.video_url, sub.video_thumbnail_url].filter((p): p is string => !!p && p.startsWith(`${folder}/`));
  if (files.length) await admin.storage.from("uploads").remove(files);
  return { ok: true };
}
