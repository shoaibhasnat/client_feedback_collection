import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/utils";

// Landing point for auth email links (password reset). Supports both PKCE codes and token hashes.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const target = safeRelativePath(searchParams.get("next")) ?? "/";
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  return NextResponse.redirect(new URL(ok ? target : "/login?error=link-expired", origin));
}
