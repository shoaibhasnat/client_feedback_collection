"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable, requireOwner } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { storeImage, UploadError } from "@/lib/uploads";
import { nullIfEmpty } from "@/lib/utils";

export type SettingsState = { error?: string; ok?: boolean };

const url = z.string().regex(/^https?:\/\/\S+$/, "Links must start with https://");

export async function saveProfileAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await assertWritable();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Enter your name.").max(120),
      tagline: z.string().max(200),
      services: z.array(z.string().max(100)).max(30),
      contact_links: z.array(url).max(20),
      share_url: url.nullable(),
    })
    .safeParse({
      name: String(formData.get("name") ?? ""),
      tagline: String(formData.get("tagline") ?? "").trim(),
      services: String(formData.get("services") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      contact_links: String(formData.get("contact_links") ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
      share_url: nullIfEmpty(formData.get("share_url")),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { data: current } = await ctx.supabase.from("site_settings").select("profile").eq("workspace_id", ctx.workspace.id).single();
  const profile: Record<string, unknown> = { ...((current?.profile ?? {}) as Record<string, unknown>), ...parsed.data };

  const photo = formData.get("photo");
  if (formData.get("remove_photo") === "on") profile.photo_url = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      profile.photo_url = await storeImage(ctx.supabase, ctx.workspace.id, "profile", photo, { square: true });
    } catch (e) {
      if (e instanceof UploadError) return { error: e.message };
      throw e;
    }
  }

  const { error } = await ctx.supabase.from("site_settings").update({ profile }).eq("workspace_id", ctx.workspace.id);
  if (error) return { error: error.message };
  await ctx.supabase.from("profiles").update({ name: parsed.data.name }).eq("id", ctx.user.id);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function saveMessageTemplatesAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await assertWritable();
  const parsed = z
    .object({
      upwork: z.string().trim().min(1).max(2000),
      email: z.string().trim().min(1).max(4000),
      whatsapp: z.string().trim().min(1).max(2000),
      reminder: z.string().trim().min(1).max(2000),
      reminder_days: z.coerce.number().int().min(1).max(60),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Every template needs some text, and reminder days must be 1–60." };
  for (const key of ["upwork", "email", "whatsapp", "reminder"] as const) {
    if (!parsed.data[key].includes("{link}")) return { error: `The ${key} template must include {link}.` };
  }
  const { error } = await ctx.supabase
    .from("site_settings")
    .update({ message_templates: parsed.data })
    .eq("workspace_id", ctx.workspace.id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function changePasswordAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await requireOwner();
  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The new passwords don't match." };

  // Re-authenticate before changing the password.
  const { error: authError } = await ctx.supabase.auth.signInWithPassword({ email: ctx.profile.email, password: current });
  if (authError) return { error: "Your current password is incorrect." };

  const { error } = await ctx.supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  await logAudit({ actorUserId: ctx.user.id, workspaceId: ctx.workspace.id, action: "auth.password_changed", targetType: "user", targetId: ctx.user.id });
  return { ok: true };
}
