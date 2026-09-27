"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { removeFolder, storeImage, UploadError } from "@/lib/uploads";
import { nullIfEmpty } from "@/lib/utils";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean };

const url = z
  .string()
  .max(2000)
  .refine((v) => /^https?:\/\/\S+\.\S+/.test(v), "Use a full link starting with https://")
  .nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  company: z.string().max(200).nullable(),
  job_title: z.string().max(200).nullable(),
  emails: z.array(z.email("One of the emails isn't valid.")).max(10),
  phone: z.string().max(40).nullable(),
  whatsapp: z.string().max(40).nullable(),
  linkedin_url: url,
  website: url,
  socials: z.array(z.string().max(500)).max(20),
  country: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  timezone: z.string().max(100).nullable(),
  preferred_contact: z.string().max(50).nullable(),
  source: z.enum(["upwork", "referral", "direct", "other"]),
  referred_by_client_id: z.uuid().nullable(),
  upwork_url: url,
  status: z.enum(["active", "past", "prospect", "do_not_contact"]),
  first_project_date: date,
  last_project_date: date,
  follow_up_date: date,
  birthday: date,
});

function list(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseClient(formData: FormData) {
  const raw = {
    name: String(formData.get("name") ?? ""),
    company: nullIfEmpty(formData.get("company")),
    job_title: nullIfEmpty(formData.get("job_title")),
    emails: list(formData.get("emails")).map((e) => e.toLowerCase()),
    phone: nullIfEmpty(formData.get("phone")),
    whatsapp: nullIfEmpty(formData.get("whatsapp")),
    linkedin_url: nullIfEmpty(formData.get("linkedin_url")),
    website: nullIfEmpty(formData.get("website")),
    socials: String(formData.get("socials") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
    country: nullIfEmpty(formData.get("country")),
    city: nullIfEmpty(formData.get("city")),
    timezone: nullIfEmpty(formData.get("timezone")),
    preferred_contact: nullIfEmpty(formData.get("preferred_contact")),
    source: String(formData.get("source") ?? "direct"),
    referred_by_client_id: nullIfEmpty(formData.get("referred_by_client_id")),
    upwork_url: nullIfEmpty(formData.get("upwork_url")),
    status: String(formData.get("status") ?? "active"),
    first_project_date: nullIfEmpty(formData.get("first_project_date")),
    last_project_date: nullIfEmpty(formData.get("last_project_date")),
    follow_up_date: nullIfEmpty(formData.get("follow_up_date")),
    birthday: nullIfEmpty(formData.get("birthday")),
  };
  const parsed = clientSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Check the highlighted fields.", fieldErrors } as const;
  }
  if (parsed.data.source !== "referral") parsed.data.referred_by_client_id = null;
  return { data: parsed.data } as const;
}

async function handleImages(
  formData: FormData,
  ctx: Awaited<ReturnType<typeof assertWritable>>,
  clientId: string,
): Promise<{ photo_url?: string | null; logo_url?: string | null }> {
  const out: { photo_url?: string | null; logo_url?: string | null } = {};
  for (const [field, square] of [["photo", true], ["logo", false]] as const) {
    const file = formData.get(field);
    const column = field === "photo" ? "photo_url" : "logo_url";
    if (formData.get(`remove_${field}`) === "on") out[column] = null;
    if (file instanceof File && file.size > 0) {
      out[column] = await storeImage(ctx.supabase, ctx.workspace.id, `clients/${clientId}`, file, { square });
    }
  }
  return out;
}

export async function createClientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await assertWritable();
  const parsed = parseClient(formData);
  if ("error" in parsed) return parsed;

  const { data: client, error } = await ctx.supabase
    .from("clients")
    .insert({ ...parsed.data, workspace_id: ctx.workspace.id })
    .select("id")
    .single();
  if (error) return { error: error.message };

  try {
    const images = await handleImages(formData, ctx, client.id);
    if (Object.keys(images).length) await ctx.supabase.from("clients").update(images).eq("id", client.id);
  } catch (e) {
    if (!(e instanceof UploadError)) throw e;
    // Client saved; the image problem is reported on the edit page.
    redirect(`/admin/clients/${client.id}/edit?image_error=${encodeURIComponent(e.message)}`);
  }

  const note = nullIfEmpty(formData.get("initial_note"));
  if (note) await ctx.supabase.from("client_notes").insert({ workspace_id: ctx.workspace.id, client_id: client.id, body: note });

  await logActivity(ctx.supabase, { workspaceId: ctx.workspace.id, clientId: client.id, entityType: "client", entityId: client.id, action: "created" });
  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${client.id}`);
}

export async function updateClientAction(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await assertWritable();
  const parsed = parseClient(formData);
  if ("error" in parsed) return parsed;
  if (parsed.data.referred_by_client_id === clientId) {
    return { error: "A client can't refer themselves.", fieldErrors: { referred_by_client_id: "Pick another client." } };
  }

  let images: Awaited<ReturnType<typeof handleImages>>;
  try {
    images = await handleImages(formData, ctx, clientId);
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    throw e;
  }

  const { error } = await ctx.supabase.from("clients").update({ ...parsed.data, ...images }).eq("id", clientId);
  if (error) return { error: error.message };

  await logActivity(ctx.supabase, { workspaceId: ctx.workspace.id, clientId, entityType: "client", entityId: clientId, action: "updated" });
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(`/admin/clients/${clientId}`);
}

/** "Right to be forgotten": removes the client, every dependent row (via FK cascades) and their files. */
export async function deleteClientAction(clientId: string) {
  const ctx = await assertWritable();
  const { data: requests } = await ctx.supabase.from("requests").select("submissions(id)").eq("client_id", clientId);
  const submissionIds = (requests ?? []).flatMap((r) => {
    const s = r.submissions as unknown as { id: string } | { id: string }[] | null;
    return Array.isArray(s) ? s.map((x) => x.id) : s ? [s.id] : [];
  });

  const { error } = await ctx.supabase.from("clients").delete().eq("id", clientId);
  if (error) throw new Error(error.message);

  await removeFolder(ctx.supabase, `${ctx.workspace.id}/clients/${clientId}`);
  for (const id of submissionIds) await removeFolder(ctx.supabase, `${ctx.workspace.id}/submissions/${id}`);

  revalidatePath("/admin", "layout");
  redirect("/admin/clients?deleted=1");
}

export async function addNoteAction(clientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await assertWritable();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a note first." };
  if (body.length > 5000) return { error: "Notes are limited to 5,000 characters." };
  const { error } = await ctx.supabase.from("client_notes").insert({ workspace_id: ctx.workspace.id, client_id: clientId, body });
  if (error) return { error: error.message };
  revalidatePath(`/admin/clients/${clientId}`);
  return { ok: true };
}

export async function deleteNoteAction(clientId: string, noteId: string) {
  const ctx = await assertWritable();
  await ctx.supabase.from("client_notes").delete().eq("id", noteId);
  revalidatePath(`/admin/clients/${clientId}`);
}
