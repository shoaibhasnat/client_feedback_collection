"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { consentViolations } from "@/lib/consent";
import type { ConsentLevel, TemplateSnapshot } from "@/lib/form/types";
import { storeImage, UploadError } from "@/lib/uploads";
import { firstName, nullIfEmpty } from "@/lib/utils";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { itemSchema } from "@/lib/form/steps";
import { mappingAllows } from "@/lib/form/catalog";
import { CLIENT_FIELD_OPTIONS } from "@/lib/form/snapshot";
import { pickTagIds } from "@/lib/tags";
import { revalidateSite } from "@/lib/site/cache";

type Ctx = Awaited<ReturnType<typeof assertWritable>>;

/** Turn a database rule violation (consent, media path) into a message for the owner. */
function friendlyError(message: string): string {
  const m = /consent_violation: (.*)$/.exec(message);
  if (m) return m[1];
  if (message.includes("must be a file in this workspace")) return "That image isn't one of this workspace's files.";
  return message;
}

async function syncTestimonialTags(ctx: Ctx, testimonialId: string, formData: FormData) {
  if (formData.get("tags_present") !== "1") return;
  const { data: tags } = await ctx.supabase.from("tags").select("id");
  const ids = pickTagIds(formData, tags ?? []);
  await ctx.supabase.from("testimonial_tags").delete().eq("testimonial_id", testimonialId);
  if (ids.length) {
    await ctx.supabase
      .from("testimonial_tags")
      .insert(ids.map((tag_id) => ({ workspace_id: ctx.workspace.id, testimonial_id: testimonialId, tag_id })));
  }
}

export type EditorState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const editorSchema = z.object({
  display_quote: z.string().max(3000).nullable(),
  headline: z.string().max(150).nullable(),
  display_name: z.string().max(150).nullable(),
  display_role: z.string().max(150).nullable(),
  display_company: z.string().max(150).nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  visibility: z.enum(["published", "hidden", "private"]),
  featured: z.boolean(),
  use_photo: z.boolean(),
  use_logo: z.boolean(),
  use_video: z.boolean(),
});

function readEditor(formData: FormData) {
  const rating = nullIfEmpty(formData.get("rating"));
  return editorSchema.safeParse({
    display_quote: nullIfEmpty(formData.get("display_quote")),
    headline: nullIfEmpty(formData.get("headline")),
    display_name: nullIfEmpty(formData.get("display_name")),
    display_role: nullIfEmpty(formData.get("display_role")),
    display_company: nullIfEmpty(formData.get("display_company")),
    rating: rating === null ? null : Number(rating),
    date: nullIfEmpty(formData.get("date")),
    visibility: String(formData.get("visibility") ?? "hidden"),
    featured: formData.get("featured") === "on",
    use_photo: formData.get("use_photo") === "on",
    use_logo: formData.get("use_logo") === "on",
    use_video: formData.get("use_video") === "on",
  });
}

const REQUEST_STATUS_FOR = { published: "published", private: "private", hidden: "reviewed" } as const;

/** Create or update the showcase testimonial for a submission. The submission itself is never modified. */
export async function saveFromSubmissionAction(submissionId: string, _prev: EditorState, formData: FormData): Promise<EditorState> {
  const ctx = await assertWritable();
  const parsed = readEditor(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;

  const { data: sub } = await ctx.supabase
    .from("submissions")
    .select("id, request_id, about, consent_level, submitted_at, video_url, video_thumbnail_url, requests(id, client_id, project_id, template_snapshot)")
    .eq("id", submissionId)
    .single();
  if (!sub?.submitted_at) return { error: "This submission isn't complete yet." };
  const req = sub.requests as unknown as { id: string; client_id: string; project_id: string | null; template_snapshot: TemplateSnapshot };

  // Photo / logo come from what the client uploaded on the form (About You image fields).
  const imageFor = (field: "photo_url" | "logo_url") => {
    const item = req.template_snapshot.items.find((i) => i.type === "image" && i.maps_to_client_field === field);
    const v = item ? (sub.about as Record<string, unknown>)[item.key] : null;
    return typeof v === "string" && v ? v : null;
  };

  const { data: existing } = await ctx.supabase
    .from("testimonials")
    .select("id, visibility, published_at, video_thumbnail_url, approval_status, approval_quote")
    .eq("submission_id", submissionId)
    .maybeSingle();

  // Video: the client's own recording; the thumbnail is theirs unless the owner uploads a better frame.
  const useVideo = f.use_video && Boolean(sub.video_url);
  let thumbnail: string | null = useVideo ? (existing?.video_thumbnail_url ?? sub.video_thumbnail_url ?? null) : null;
  const thumbFile = formData.get("video_thumbnail");
  if (useVideo && thumbFile instanceof File && thumbFile.size > 0) {
    try {
      thumbnail = await storeImage(ctx.supabase, ctx.workspace.id, "testimonials/thumbnails", thumbFile, { maxSize: 1280 });
    } catch (e) {
      if (e instanceof UploadError) return { error: e.message, fieldErrors: { video_thumbnail_url: e.message } };
      throw e;
    }
  }

  const display = {
    display_quote: f.display_quote,
    headline: f.headline,
    display_name: f.display_name,
    display_role: f.display_role,
    display_company: f.display_company,
    rating: f.rating,
    date: f.date,
    visibility: f.visibility,
    featured: f.featured,
    photo_url: f.use_photo ? imageFor("photo_url") : null,
    logo_url: f.use_logo ? imageFor("logo_url") : null,
    video_url: useVideo ? sub.video_url : null,
    video_thumbnail_url: thumbnail,
  };

  if (f.visibility === "published" && !f.display_quote) {
    return { error: "Write a display quote before publishing.", fieldErrors: { display_quote: "Required to publish." } };
  }
  const violations = consentViolations(sub.consent_level as ConsentLevel | null, display);
  if (Object.keys(violations).length) {
    return { error: "This goes beyond what the client agreed to show.", fieldErrors: violations };
  }

  // An approval covers one exact wording. Editing the quote afterwards voids it.
  const approvalReset =
    existing && existing.approval_status !== "not_needed" && (existing.approval_quote ?? "") !== (f.display_quote ?? "")
      ? { approval_status: "not_needed" as const, approval_token_hash: null, approval_quote: null, approval_requested_at: null }
      : {};
  const now = new Date().toISOString();
  const publishedAt = f.visibility === "published" ? (existing?.published_at ?? now) : null;

  let testimonialId = existing?.id ?? null;
  if (existing) {
    const { error } = await ctx.supabase.from("testimonials").update({ ...display, ...approvalReset, published_at: publishedAt }).eq("id", existing.id);
    if (error) return { error: friendlyError(error.message) };
  } else {
    const { data: inserted, error } = await ctx.supabase.from("testimonials").insert({
      ...display,
      workspace_id: ctx.workspace.id,
      submission_id: submissionId,
      client_id: req.client_id,
      project_id: req.project_id,
      source: "form",
      consent_level: sub.consent_level,
      published_at: publishedAt,
    }).select("id").single();
    if (error) return { error: friendlyError(error.message) };
    testimonialId = inserted.id;
  }
  if (testimonialId) await syncTestimonialTags(ctx, testimonialId, formData);

  // Replaced custom thumbnails are removed (the client's own thumbnail stays with the submission).
  const oldThumb = existing?.video_thumbnail_url;
  if (oldThumb && oldThumb !== thumbnail && oldThumb !== sub.video_thumbnail_url && oldThumb.startsWith(`${ctx.workspace.id}/testimonials/`)) {
    await ctx.supabase.storage.from("uploads").remove([oldThumb]);
  }

  await ctx.supabase
    .from("requests")
    .update({ status: REQUEST_STATUS_FOR[f.visibility], reviewed_at: now })
    .eq("id", req.id);

  if (existing?.visibility !== f.visibility) {
    await logActivity(ctx.supabase, {
      workspaceId: ctx.workspace.id,
      clientId: req.client_id,
      entityType: "testimonial",
      action: f.visibility === "published" ? "published" : f.visibility === "private" ? "marked_private" : "reviewed",
      meta: { submission_id: submissionId },
    });
  }
  revalidatePath("/admin", "layout");
  revalidateSite(ctx.workspace.id);
  return { ok: true };
}

/**
 * Accept selected About You / Contact answers into the client record. Nothing is overwritten
 * silently: only fields the owner ticked, only from a submitted form, and every value is
 * re-validated against its item type before it reaches the client.
 */
export async function mergeIntoClientAction(submissionId: string, formData: FormData) {
  const ctx = await assertWritable();
  const fields = formData.getAll("field").map(String);

  const { data: sub } = await ctx.supabase
    .from("submissions")
    .select("id, about, contact, submitted_at, requests(client_id, template_snapshot)")
    .eq("id", submissionId)
    .single();
  if (!sub?.submitted_at) return;
  const req = sub.requests as unknown as { client_id: string; template_snapshot: TemplateSnapshot };
  const { data: client } = await ctx.supabase.from("clients").select("emails, custom_fields").eq("id", req.client_id).single();
  const { data: customDefs } = await ctx.supabase.from("settings_custom_fields").select("key").eq("entity", "client");
  const customKeys = new Set((customDefs ?? []).map((d) => d.key));

  const patch: Record<string, unknown> = {};
  const custom: Record<string, unknown> = { ...((client?.custom_fields ?? {}) as Record<string, unknown>) };
  let customChanged = false;

  for (const item of req.template_snapshot.items) {
    const target = item.maps_to_client_field;
    if (!target || item.section === "question" || !fields.includes(target)) continue;
    const bucket = (item.section === "about" ? sub.about : sub.contact) as Record<string, unknown>;
    const raw = bucket[item.key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const value = raw.trim();
    if (!itemSchema(item).safeParse(value).success || !mappingAllows(target, item.type)) continue;

    if (target.startsWith("custom:")) {
      if (!customKeys.has(target.slice(7))) continue;
      custom[target.slice(7)] = value;
      customChanged = true;
    } else if (!(CLIENT_FIELD_OPTIONS as readonly string[]).includes(target)) {
      continue;
    } else if (target === "email") {
      const emails = ((client?.emails ?? []) as string[]).filter((e) => e.toLowerCase() !== value.toLowerCase());
      patch.emails = [value.toLowerCase(), ...emails];
    } else if (target === "photo_url" || target === "logo_url") {
      if (value.startsWith(`${ctx.workspace.id}/`)) patch[target] = value;
    } else {
      patch[target] = value;
    }
  }
  if (customChanged) patch.custom_fields = custom;

  if (Object.keys(patch).length) {
    await ctx.supabase.from("clients").update(patch).eq("id", req.client_id);
    await logActivity(ctx.supabase, {
      workspaceId: ctx.workspace.id,
      clientId: req.client_id,
      entityType: "client",
      entityId: req.client_id,
      action: "updated_from_submission",
      meta: { fields: Object.keys(patch) },
    });
  }
  await ctx.supabase
    .from("submissions")
    .update({ merge_status: "merged", merge_resolved_at: new Date().toISOString() })
    .eq("id", submissionId);
  revalidatePath(`/admin/testimonials/review/${submissionId}`);
  revalidatePath(`/admin/clients/${req.client_id}`);
}

export async function dismissMergeAction(submissionId: string) {
  const ctx = await assertWritable();
  await ctx.supabase
    .from("submissions")
    .update({ merge_status: "dismissed", merge_resolved_at: new Date().toISOString() })
    .eq("id", submissionId);
  revalidatePath(`/admin/testimonials/review/${submissionId}`);
}

// ---------- Manual testimonials (e.g. an existing Upwork review) ----------

const manualSchema = z.object({
  client_id: z.uuid().nullable(),
  source: z.enum(["upwork_review", "manual"]),
  proof_link: z.string().regex(/^https?:\/\/\S+$/, "Use a full link starting with https://").nullable(),
});

export async function saveManualAction(testimonialId: string | null, _prev: EditorState, formData: FormData): Promise<EditorState> {
  const ctx = await assertWritable();
  const parsed = readEditor(formData);
  const meta = manualSchema.safeParse({
    client_id: nullIfEmpty(formData.get("client_id")),
    source: String(formData.get("source") ?? "manual"),
    proof_link: nullIfEmpty(formData.get("proof_link")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!meta.success) return { error: meta.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  if (!f.display_quote) return { error: "Enter the testimonial text.", fieldErrors: { display_quote: "Required." } };

  let proofPath: string | undefined;
  const proof = formData.get("proof");
  if (proof instanceof File && proof.size > 0) {
    try {
      proofPath = await storeImage(ctx.supabase, ctx.workspace.id, "testimonials/proof", proof);
    } catch (e) {
      if (e instanceof UploadError) return { error: e.message };
      throw e;
    }
  }

  const row = {
    display_quote: f.display_quote,
    headline: f.headline,
    display_name: f.display_name,
    display_role: f.display_role,
    display_company: f.display_company,
    rating: f.rating,
    date: f.date,
    visibility: f.visibility,
    featured: f.featured,
    client_id: meta.data.client_id,
    source: meta.data.source,
    // proof_url holds either the uploaded screenshot (storage path) or the review link.
    ...(proofPath ? { proof_url: proofPath } : meta.data.proof_link ? { proof_url: meta.data.proof_link } : {}),
    published_at: f.visibility === "published" ? new Date().toISOString() : null,
  };

  let id = testimonialId;
  if (id) {
    const { error } = await ctx.supabase.from("testimonials").update(row).eq("id", id).is("submission_id", null);
    if (error) return { error: friendlyError(error.message) };
  } else {
    const { data, error } = await ctx.supabase
      .from("testimonials")
      .insert({ ...row, workspace_id: ctx.workspace.id })
      .select("id")
      .single();
    if (error) return { error: friendlyError(error.message) };
    id = data.id;
    await logActivity(ctx.supabase, {
      workspaceId: ctx.workspace.id,
      clientId: meta.data.client_id,
      entityType: "testimonial",
      entityId: id,
      action: "added_manually",
    });
  }
  if (id) await syncTestimonialTags(ctx, id, formData);
  revalidatePath("/admin/testimonials");
  revalidateSite(ctx.workspace.id);
  redirect(`/admin/testimonials/${id}?saved=1`);
}

export async function deleteTestimonialAction(testimonialId: string) {
  const ctx = await assertWritable();
  const { data: t } = await ctx.supabase.from("testimonials").select("submission_id, proof_url").eq("id", testimonialId).single();
  await ctx.supabase.from("testimonials").delete().eq("id", testimonialId);
  if (t?.proof_url && t.proof_url.startsWith(`${ctx.workspace.id}/`)) {
    await ctx.supabase.storage.from("uploads").remove([t.proof_url]);
  }
  revalidatePath("/admin/testimonials");
  revalidateSite(ctx.workspace.id);
  redirect(t?.submission_id ? `/admin/testimonials/review/${t.submission_id}` : "/admin/testimonials?view=all");
}

export type BulkResult = { ok: boolean; message: string };

/** Bulk actions from the testimonials list (brief §4.5). Consent rules still apply row by row. */
export async function bulkTestimonialAction(input: { ids: string[]; op: string; tagId?: string | null }): Promise<BulkResult> {
  const ctx = await assertWritable();
  const parsed = z
    .object({
      ids: z.array(z.uuid()).min(1, "Select at least one testimonial.").max(200),
      op: z.enum(["publish", "hide", "private", "tag_add", "tag_remove", "delete"]),
      tagId: z.uuid().nullish(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { ids, op, tagId } = parsed.data;

  if (op === "tag_add" || op === "tag_remove") {
    if (!tagId) return { ok: false, message: "Choose a tag." };
    const { data: tag } = await ctx.supabase.from("tags").select("id, name").eq("id", tagId).maybeSingle();
    if (!tag) return { ok: false, message: "Tag not found." };
    if (op === "tag_add") {
      const { error } = await ctx.supabase.from("testimonial_tags").upsert(
        ids.map((id) => ({ workspace_id: ctx.workspace.id, testimonial_id: id, tag_id: tagId })),
        { onConflict: "testimonial_id,tag_id", ignoreDuplicates: true },
      );
      if (error) return { ok: false, message: error.message };
    } else {
      await ctx.supabase.from("testimonial_tags").delete().eq("tag_id", tagId).in("testimonial_id", ids);
    }
    revalidatePath("/admin/testimonials");
    revalidateSite(ctx.workspace.id);
  revalidateSite(ctx.workspace.id);
    return { ok: true, message: `${op === "tag_add" ? "Tagged" : "Untagged"} ${ids.length} with “${tag.name}”.` };
  }

  if (op === "delete") {
    const { data: rows } = await ctx.supabase.from("testimonials").select("id, proof_url").in("id", ids);
    await ctx.supabase.from("testimonials").delete().in("id", ids);
    const files = (rows ?? []).map((r) => r.proof_url).filter((u): u is string => !!u && u.startsWith(`${ctx.workspace.id}/`));
    if (files.length) await ctx.supabase.storage.from("uploads").remove(files);
    revalidatePath("/admin", "layout");
    revalidateSite(ctx.workspace.id);
  revalidateSite(ctx.workspace.id);
    return { ok: true, message: `Deleted ${rows?.length ?? 0}. Original client submissions are kept.` };
  }

  const visibility = op === "publish" ? "published" : op === "hide" ? "hidden" : "private";
  const { data: rows } = await ctx.supabase.from("testimonials").select("id, published_at, display_quote").in("id", ids);
  let done = 0;
  const blocked: string[] = [];
  for (const row of rows ?? []) {
    if (visibility === "published" && !row.display_quote) {
      blocked.push("no display quote");
      continue;
    }
    const { error } = await ctx.supabase
      .from("testimonials")
      .update({
        visibility,
        published_at: visibility === "published" ? (row.published_at ?? new Date().toISOString()) : null,
      })
      .eq("id", row.id);
    if (error) blocked.push(friendlyError(error.message));
    else done += 1;
  }
  revalidatePath("/admin", "layout");
  revalidateSite(ctx.workspace.id);
  const verb = op === "publish" ? "Published" : op === "hide" ? "Hidden" : "Marked private";
  return {
    ok: blocked.length === 0,
    message: `${verb} ${done}.${blocked.length ? ` ${blocked.length} skipped: ${[...new Set(blocked)].join("; ")}` : ""}`,
  };
}

// ---------- Client approval of an edited quote (brief §4.4) ----------

export type ApprovalState = { error?: string; link?: string; message?: string };

/**
 * Create a one-time approval link for the current display quote. Only the token's hash is
 * stored, so the link is shown to the owner once; asking again replaces the old link.
 */
export async function requestApprovalAction(testimonialId: string): Promise<ApprovalState> {
  const ctx = await assertWritable();
  const { data: t } = await ctx.supabase
    .from("testimonials")
    .select("id, display_quote, submission_id, client_id, clients(name)")
    .eq("id", testimonialId)
    .single();
  if (!t?.submission_id) return { error: "Only testimonials from a client's form can be sent for approval." };
  if (!t.display_quote?.trim()) return { error: "Write and save a display quote first." };

  const token = randomToken(24);
  const { error } = await ctx.supabase
    .from("testimonials")
    .update({
      approval_status: "pending",
      approval_token_hash: sha256(token),
      approval_quote: t.display_quote,
      approval_requested_at: new Date().toISOString(),
      approval_responded_at: null,
      approval_comment: null,
    })
    .eq("id", testimonialId);
  if (error) return { error: friendlyError(error.message) };

  await logActivity(ctx.supabase, {
    workspaceId: ctx.workspace.id,
    clientId: t.client_id,
    entityType: "testimonial",
    entityId: testimonialId,
    action: "approval_requested",
  });

  const link = `${env.appUrl}/a/${token}`;
  const clientName = (t.clients as unknown as { name: string } | null)?.name ?? "";
  const message =
    `Hi ${firstName(clientName) || "there"}, thanks again for your kind words! ` +
    `I tidied your feedback into a short quote for my website. Could you check it's OK? ` +
    `You can approve it or suggest changes here: ${link}`;
  revalidatePath("/admin", "layout");
  return { link, message };
}

export async function cancelApprovalAction(testimonialId: string) {
  const ctx = await assertWritable();
  await ctx.supabase
    .from("testimonials")
    .update({ approval_status: "not_needed", approval_token_hash: null, approval_quote: null, approval_requested_at: null })
    .eq("id", testimonialId);
  revalidatePath("/admin", "layout");
}
