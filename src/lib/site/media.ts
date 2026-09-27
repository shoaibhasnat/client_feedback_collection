import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { realtimeOptions } from "@/lib/supabase/transport";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: string) => UUID.test(v);

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

/**
 * Stream a file from the private bucket. `resolve` asks the database (as anon) for the path it is
 * allowed to serve — null unless the item is published / the workspace is active — so this route can
 * never be pointed at an arbitrary object.
 */
export async function streamPublicFile(resolve: (anon: ReturnType<typeof anonClient>) => Promise<string | null>, maxAge: number) {
  const path = await resolve(anonClient());
  if (!path) return notFound();
  const { data, error } = await createAdminClient().storage.from("uploads").download(path);
  if (error || !data) return notFound();
  const type = data.type && data.type.startsWith("image/") ? data.type : "application/octet-stream";
  return new Response(data.stream(), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.size),
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}

function anonClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false }, ...realtimeOptions });
}

export { notFound as mediaNotFound };
