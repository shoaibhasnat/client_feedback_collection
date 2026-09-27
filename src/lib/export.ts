import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Full workspace export (brief §4.7 "export all data", §9 "includes all tables and media links").
// Everything is read with the OWNER's session, so Row Level Security limits it to their workspace.

/** Every business table (same list as the RLS migration). */
export const EXPORT_TABLES = [
  "clients",
  "client_notes",
  "projects",
  "attachments",
  "form_templates",
  "form_items",
  "requests",
  "submissions",
  "testimonials",
  "tags",
  "testimonial_tags",
  "client_tags",
  "collections",
  "collection_items",
  "widgets",
  "site_settings",
  "theme_versions",
  "settings_custom_fields",
  "activity_log",
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

// Request tokens and approval token hashes are credentials, not data: leave them out.
const OMIT: Partial<Record<ExportTable, string[]>> = {
  requests: ["token"],
  testimonials: ["approval_token_hash"],
};

async function readAll(supabase: SupabaseClient, table: ExportTable): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    // Order by a unique key as well so pages never overlap or skip rows.
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const omit = OMIT[table] ?? [];
  return omit.length ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !omit.includes(k)))) : rows;
}

export async function collectWorkspaceData(supabase: SupabaseClient): Promise<Record<ExportTable, Record<string, unknown>[]>> {
  const entries = await Promise.all(EXPORT_TABLES.map(async (t) => [t, await readAll(supabase, t)] as const));
  return Object.fromEntries(entries) as Record<ExportTable, Record<string, unknown>[]>;
}

export type StoredFile = { path: string; size: number | null; type: string | null; updated_at: string | null };

/** Every file under `{workspaceId}/` in the uploads bucket (storage policies scope this too). */
export async function listWorkspaceFiles(supabase: SupabaseClient, workspaceId: string): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  const walk = async (prefix: string, depth: number): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from("uploads").list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`storage: ${error.message}`);
      for (const f of data ?? []) {
        const path = `${prefix}/${f.name}`;
        if (f.id) {
          const meta = (f.metadata ?? {}) as { size?: number; mimetype?: string };
          out.push({ path, size: meta.size ?? null, type: meta.mimetype ?? null, updated_at: f.updated_at ?? null });
        } else if (depth < 8) await walk(path, depth + 1);
      }
      if (!data || data.length < 1000) break;
    }
  };
  await walk(workspaceId, 0);
  return out;
}
