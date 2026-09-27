/**
 * Bootstrap the super admin (brief 10.3). There is no UI to grant super admin:
 * this script creates (or updates) the auth user for SUPER_ADMIN_EMAIL and flags it.
 *
 *   npm run seed:admin
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPER_ADMIN_EMAIL?.toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});

async function main() {
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = list.users.find((u) => u.email?.toLowerCase() === email);

  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true, ban_duration: "none" });
    if (error) throw error;
    console.log(`Updated existing user ${email}.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Super admin" },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created user ${email}.`);
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: user!.id, email, name: "Super admin", is_super_admin: true, status: "active" }, { onConflict: "id" });
  if (profileError) throw profileError;
  console.log("Super admin ready. Sign in at /login.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
