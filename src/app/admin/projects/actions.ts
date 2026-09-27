"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { randomToken } from "@/lib/crypto";
import { IMAGE_TYPES, processImage, UploadError } from "@/lib/uploads";
import { nullIfEmpty } from "@/lib/utils";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const projectSchema = z.object({
  client_id: z.uuid("Choose a client."),
  name: z.string().trim().min(1, "Project name is required.").max(200),
  description: z.string().max(5000).nullable(),
  service_type: z.string().max(100).nullable(),
  platform: z.enum(["upwork", "direct", "referral", "other"]),
  status: z.enum(["in_progress", "completed", "cancelled"]),
  start_date: date,
  end_date: date,
  budget: z.number().nonnegative().max(1e10).nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.").nullable(),
  links: z
    .array(z.object({ label: z.string().max(100), url: z.string().regex(/^https?:\/\/\S+$/, "Links must start with https://") }))
    .max(20),
  outcomes: z.string().max(5000).nullable(),
  notes: z.string().max(10000).nullable(),
});

/** "Label | https://…" or just a URL, one per line. */
function parseLinks(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.split("|").map((s) => s.trim());
      return b ? { label: a, url: b } : { label: "", url: a };
    });
}

function parseProject(formData: FormData) {
  const budgetRaw = nullIfEmpty(formData.get("budget"));
  const parsed = projectSchema.safeParse({
    client_id: String(formData.get("client_id") ?? ""),
    name: String(formData.get("name") ?? ""),
    description: nullIfEmpty(formData.get("description")),
    service_type: nullIfEmpty(formData.get("service_type")),
    platform: String(formData.get("platform") ?? "direct"),
    status: String(formData.get("status") ?? "completed"),
    start_date: nullIfEmpty(formData.get("start_date")),
    end_date: nullIfEmpty(formData.get("end_date")),
    budget: budgetRaw === null ? null : Number(budgetRaw),
    currency: nullIfEmpty(formData.get("currency")),
    links: parseLinks(formData.get("links")),
    outcomes: nullIfEmpty(formData.get("outcomes")),
    notes: nullIfEmpty(formData.get("notes")),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Check the highlighted fields.", fieldErrors } as const;
  }
  if (parsed.data.start_date && parsed.data.end_date && parsed.data.end_date < parsed.data.start_date) {
    return { error: "The end date is before the start date.", fieldErrors: { end_date: "Must be after the start date." } } as const;
  }
  return { data: parsed.data } as const;
}

/** Keep the client's first/last project dates in step with their projects. */
async function syncClientDates(supabase: Awaited<ReturnType<typeof assertWritable>>["supabase"], clientId: string) {
  const { data } = await supabase.from("projects").select("start_date, end_date").eq("client_id", clientId);
  const starts = (data ?? []).map((p) => p.start_date ?? p.end_date).filter(Boolean).sort();
  const ends = (data ?? []).map((p) => p.end_date ?? p.start_date).filter(Boolean).sort();
  if (!starts.length) return;
  await supabase
    .from("clients")
    .update({ first_project_date: starts[0], last_project_date: ends[ends.length - 1] })
    .eq("id", clientId);
}

export async function createProjectAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await assertWritable();
  const parsed = parseProject(formData);
  if ("error" in parsed) return parsed;

  const { data, error } = await ctx.supabase
    .from("projects")
    .insert({ ...parsed.data, workspace_id: ctx.workspace.id })
    .select("id")
    .single();
  if (error) return { error: error.code === "23503" ? "That client no longer exists." : error.message };

  await syncClientDates(ctx.supabase, parsed.data.client_id);
  await logActivity(ctx.supabase, {
    workspaceId: ctx.workspace.id,
    clientId: parsed.data.client_id,
    entityType: "project",
    entityId: data.id,
    action: "created",
    meta: { name: parsed.data.name },
  });
  revalidatePath("/admin/projects");
  redirect(`/admin/projects/${data.id}`);
}

export async function updateProjectAction(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await assertWritable();
  const parsed = parseProject(formData);
  if ("error" in parsed) return parsed;

  const { error } = await ctx.supabase.from("projects").update(parsed.data).eq("id", projectId);
  if (error) return { error: error.message };

  await syncClientDates(ctx.supabase, parsed.data.client_id);
  revalidatePath(`/admin/projects/${projectId}`);
  redirect(`/admin/projects/${projectId}`);
}

export async function deleteProjectAction(projectId: string) {
  const ctx = await assertWritable();
  const { data: project } = await ctx.supabase.from("projects").select("client_id").eq("id", projectId).single();
  const { data: files } = await ctx.supabase.from("attachments").select("file_url").eq("owner_type", "project").eq("owner_id", projectId);
  await ctx.supabase.from("projects").delete().eq("id", projectId);
  await ctx.supabase.from("attachments").delete().eq("owner_type", "project").eq("owner_id", projectId);
  if (files?.length) await ctx.supabase.storage.from("uploads").remove(files.map((f) => f.file_url));
  revalidatePath("/admin/projects");
  redirect(project ? `/admin/clients/${project.client_id}` : "/admin/projects");
}

const ATTACHMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

export async function uploadAttachmentAction(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await assertWritable();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  if (!ATTACHMENT_TYPES.includes(file.type)) return { error: "Attach an image (JPG, PNG, WebP, GIF) or a PDF." };
  if (file.size > 8 * 1024 * 1024) return { error: "Files must be 8 MB or smaller." };

  let body: Buffer;
  let contentType = file.type;
  let ext = "pdf";
  try {
    if (file.type === "application/pdf") {
      body = Buffer.from(await file.arrayBuffer());
      if (body.subarray(0, 5).toString() !== "%PDF-") return { error: "That file isn't a valid PDF." };
    } else {
      body = await processImage(file, { maxSize: 1200 });
      contentType = "image/webp";
      ext = "webp";
    }
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }

  const path = `${ctx.workspace.id}/projects/${projectId}/${randomToken(9)}.${ext}`;
  const { error } = await ctx.supabase.storage.from("uploads").upload(path, body, { contentType });
  if (error) return { error: error.message };

  await ctx.supabase.from("attachments").insert({
    workspace_id: ctx.workspace.id,
    owner_type: "project",
    owner_id: projectId,
    file_url: path,
    file_name: file.name.slice(0, 200),
    mime_type: contentType,
  });
  revalidatePath(`/admin/projects/${projectId}`);
  return { ok: true };
}

export async function deleteAttachmentAction(projectId: string, attachmentId: string) {
  const ctx = await assertWritable();
  const { data } = await ctx.supabase.from("attachments").select("file_url").eq("id", attachmentId).single();
  if (data) {
    await ctx.supabase.storage.from("uploads").remove([data.file_url]);
    await ctx.supabase.from("attachments").delete().eq("id", attachmentId);
  }
  revalidatePath(`/admin/projects/${projectId}`);
}
