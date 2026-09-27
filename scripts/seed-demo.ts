/**
 * Demo data for local development: one workspace ("demo"), its owner, a few clients, published
 * testimonials, a tag, a collection and a widget.
 *
 *   npm run seed:demo
 *
 * Refuses to run against anything but a local Supabase stack unless ALLOW_REMOTE_SEED=1 is set,
 * so it can't pollute a production project by accident. Re-running is safe: it stops if the
 * "demo" workspace already exists.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const email = (process.env.DEMO_OWNER_EMAIL ?? "owner@demo.test").toLowerCase();
const password = process.env.DEMO_OWNER_PASSWORD || randomBytes(12).toString("base64url");

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url) && process.env.ALLOW_REMOTE_SEED !== "1") {
  console.error(`Refusing to seed demo data into ${url}. This script is for a local stack; set ALLOW_REMOTE_SEED=1 to override.`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});

const CLIENTS = [
  { name: "Jordan Blake", company: "Northwind Goods", job_title: "CEO & Founder", emails: ["jordan@northwind.test"], source: "upwork" },
  { name: "Priya Shah", company: "Kettle & Co", job_title: "Owner", emails: ["priya@kettle.test"], source: "referral" },
  { name: "Lena Fischer", company: "Alpine Outfitters", job_title: "COO", emails: ["lena@alpine.test"], source: "direct" },
] as const;

const TESTIMONIALS = [
  {
    client: 0,
    headline: "Page speed 38 → 92",
    display_quote: "Sam rebuilt our Shopify store in three weeks. Page speed went from 38 to 92 and conversions are up 18%.",
    display_role: "CEO & Founder",
    rating: 5,
    featured: true,
  },
  {
    client: 1,
    headline: null,
    display_quote: "Delivered a lightning-fast store. Communication was excellent and the results were visible within a week.",
    display_role: "Owner",
    rating: 5,
    featured: false,
  },
  {
    client: 2,
    headline: "Ready for launch day",
    display_quote: "Clear, calm and quick. Our new collection launched on time and the site handled the traffic without a hitch.",
    display_role: "COO",
    rating: 5,
    featured: false,
  },
];

async function main() {
  const { data: existing } = await admin.from("workspaces").select("id").eq("slug", "demo").maybeSingle();
  if (existing) {
    console.log("The demo workspace already exists: nothing to do. Delete it from /superadmin to start over.");
    return;
  }

  const { data: ws, error: wsError } = await admin.from("workspaces").insert({ name: "Demo Studio", slug: "demo" }).select("id").single();
  if (wsError) throw wsError;
  const { error: seedError } = await admin.rpc("seed_workspace", { ws: ws.id });
  if (seedError) throw seedError;
  await admin
    .from("site_settings")
    .update({ profile: { name: "Sam Rivera", tagline: "Shopify developer for growing brands", services: ["Shopify builds", "Speed optimisation", "Migrations"] } })
    .eq("workspace_id", ws.id);

  // Owner account (created confirmed; public sign-up stays disabled).
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let userId = list?.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (userId) {
    await admin.auth.admin.updateUserById(userId, { password });
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Sam Rivera" } });
    if (error) throw error;
    userId = data.user.id;
  }
  const { error: memberError } = await admin.from("workspace_members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  if (memberError) throw memberError;

  const { data: clients, error: clientError } = await admin
    .from("clients")
    .insert(CLIENTS.map((c) => ({ ...c, emails: [...c.emails], workspace_id: ws.id })))
    .select("id, name, company");
  if (clientError) throw clientError;

  const { data: tag } = await admin.from("tags").insert({ workspace_id: ws.id, name: "Shopify", color: "#0f9d7a" }).select("id").single();

  const ids: string[] = [];
  for (const [i, t] of TESTIMONIALS.entries()) {
    const client = clients![t.client];
    const { client: _c, ...fields } = t;
    void _c;
    const { data, error } = await admin
      .from("testimonials")
      .insert({
        ...fields,
        workspace_id: ws.id,
        client_id: client.id,
        display_name: client.name,
        display_company: client.company,
        source: "manual",
        visibility: "published",
        published_at: new Date().toISOString(),
        date: `2026-0${i + 6}-15`,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data.id);
  }
  if (tag) await admin.from("testimonial_tags").insert(ids.map((testimonial_id) => ({ workspace_id: ws.id, testimonial_id, tag_id: tag.id })));

  const { data: collection } = await admin.from("collections").insert({ workspace_id: ws.id, name: "E-commerce", slug: "e-commerce" }).select("id").single();
  if (collection) {
    await admin.from("collection_items").insert(ids.map((testimonial_id, i) => ({ workspace_id: ws.id, collection_id: collection.id, testimonial_id, sort_order: i })));
  }
  await admin.from("widgets").insert({ workspace_id: ws.id, name: "Homepage grid", config: { layout: "grid", columns: 3, max_items: 6 } });

  console.log("\nDemo workspace ready.");
  console.log(`  Public page:  ${appUrl}/demo`);
  console.log(`  Dashboard:    ${appUrl}/login`);
  console.log(`  Owner email:  ${email}`);
  console.log(`  Password:     ${process.env.DEMO_OWNER_PASSWORD ? "(DEMO_OWNER_PASSWORD from .env.local)" : password}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
