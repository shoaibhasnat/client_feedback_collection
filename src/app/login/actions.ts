"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { clientIp } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { safeRelativePath } from "@/lib/utils";

export type AuthState = { error?: string; message?: string };

const loginSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

function safeNext(next: string | undefined): string | null {
  return safeRelativePath(next);
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter your email and password." };

  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 10, 10 * 60_000)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return { error: error?.code === "user_banned" ? "This account is disabled." : "Incorrect email or password." };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_super_admin, status")
    .eq("id", data.user.id)
    .single();

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return { error: "This account is disabled." };
  }

  const { data: membership } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  await admin.from("profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("id", data.user.id);
  await logAudit({
    actorUserId: data.user.id,
    workspaceId: membership?.workspace_id ?? null,
    action: "auth.sign_in",
    targetType: "user",
    targetId: data.user.id,
  });

  redirect(safeNext(parsed.data.next) ?? (profile.is_super_admin ? "/superadmin" : "/admin"));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };

  const ip = await clientIp();
  if (!rateLimit(`reset:${ip}`, 5, 30 * 60_000)) {
    return { error: "Too many requests. Try again later." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data.toLowerCase(), {
    redirectTo: `${env.appUrl}/auth/confirm?next=/reset-password`,
  });
  // Same answer whether or not the account exists.
  return { message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== confirm) return { error: "The passwords don't match." };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  await logAudit({ actorUserId: userData.user.id, action: "auth.password_changed", targetType: "user", targetId: userData.user.id });
  redirect("/");
}
