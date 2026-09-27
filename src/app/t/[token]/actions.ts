"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRequestByToken, type LoadedRequest } from "@/lib/public-form";
import { consentText, sanitizeValues, validateAll } from "@/lib/form/steps";
import type { FormValues } from "@/lib/form/types";
import { clientIp, ipHash } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { storeImage, UploadError } from "@/lib/uploads";

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
  return { ok: true };
}
