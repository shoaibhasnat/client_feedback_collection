"use server";

import { revalidatePath } from "next/cache";
import { assertWritable } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { MAX_IMPORT_BYTES, readClientRows, type ImportRow } from "@/lib/clients-csv";
import { parseCsv } from "@/lib/csv";
import type { CustomFieldDef } from "@/lib/custom-fields";

export type ImportState = {
  error?: string;
  preview?: {
    total: number;
    ready: number;
    duplicates: { line: number; name: string; of: string }[];
    invalid: { line: number; errors: string[] }[];
    sample: string[];
    unknownColumns: string[];
  };
  done?: { imported: number; skipped: number };
};

type Ctx = Awaited<ReturnType<typeof assertWritable>>;

async function readFile(ctx: Ctx, formData: FormData): Promise<{ rows: ImportRow[]; unknownColumns: string[] } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "The file is larger than 2 MB. Split it into smaller files." };
  if (!/\.csv$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) return { error: "Upload a .csv file (in Excel: File → Save As → CSV UTF-8)." };

  const [{ data: defs }, { data: existing }] = await Promise.all([
    ctx.supabase.from("settings_custom_fields").select("id, entity, key, label, type, options").eq("entity", "client"),
    ctx.supabase.from("clients").select("name, emails").limit(10000),
  ]);
  const emails = new Map<string, string>();
  for (const c of existing ?? []) for (const e of (c.emails as string[]) ?? []) emails.set(e.toLowerCase(), `existing client “${c.name}”`);

  const parsed = readClientRows(parseCsv(await file.text()), (defs ?? []) as CustomFieldDef[], emails);
  return parsed.error ? { error: parsed.error } : parsed;
}

/** Validate an uploaded CSV and summarise what would be imported. Nothing is saved. */
export async function previewImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await assertWritable();
  const r = await readFile(ctx, formData);
  if ("error" in r) return { error: r.error };
  const ok = r.rows.filter((x) => x.client && !x.duplicateOf);
  return {
    preview: {
      total: r.rows.length,
      ready: ok.length,
      duplicates: r.rows.filter((x) => x.client && x.duplicateOf).map((x) => ({ line: x.line, name: x.client!.name, of: x.duplicateOf! })),
      invalid: r.rows.filter((x) => !x.client).map((x) => ({ line: x.line, errors: x.errors })),
      sample: ok.slice(0, 8).map((x) => x.client!.name),
      unknownColumns: r.unknownColumns,
    },
  };
}

/**
 * Import the valid rows. The file is re-read and re-validated on the server (the preview is never
 * trusted); rows with errors and rows whose email already exists are skipped, never merged.
 */
export async function runImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const ctx = await assertWritable();
  const r = await readFile(ctx, formData);
  if ("error" in r) return { error: r.error };
  const ok = r.rows.filter((x) => x.client && !x.duplicateOf).map((x) => x.client!);
  if (!ok.length) return { error: "No rows can be imported. Fix the problems listed and try again." };

  // Tags by name (case-insensitive); missing ones are created.
  const { data: tags } = await ctx.supabase.from("tags").select("id, name");
  const tagId = new Map((tags ?? []).map((t) => [String(t.name).toLowerCase(), t.id as string]));
  const newNames = [...new Set(ok.flatMap((c) => c.tags))].filter((n) => !tagId.has(n.toLowerCase())).slice(0, 200);
  if (newNames.length) {
    const unique = [...new Map(newNames.map((n) => [n.toLowerCase(), n.slice(0, 50)])).values()];
    const { data: created, error } = await ctx.supabase
      .from("tags")
      .insert(unique.map((name) => ({ workspace_id: ctx.workspace.id, name })))
      .select("id, name");
    if (error) return { error: `Couldn't create tags: ${error.message}` };
    for (const t of created ?? []) tagId.set(String(t.name).toLowerCase(), t.id);
  }

  let imported = 0;
  for (let i = 0; i < ok.length; i += 200) {
    const batch = ok.slice(i, i + 200);
    const { data: inserted, error } = await ctx.supabase
      .from("clients")
      .insert(batch.map(({ tags: _tags, ...c }) => (void _tags, { ...c, workspace_id: ctx.workspace.id })))
      .select("id, name");
    if (error) return { error: `Stopped after ${imported} clients: ${error.message}`, done: { imported, skipped: r.rows.length - imported } };
    const links = (inserted ?? []).flatMap((row, j) =>
      batch[j].tags.map((n) => tagId.get(n.toLowerCase())).filter((t): t is string => Boolean(t)).map((tag_id) => ({ workspace_id: ctx.workspace.id, client_id: row.id, tag_id })),
    );
    if (links.length) await ctx.supabase.from("client_tags").insert(links);
    imported += inserted?.length ?? 0;
  }

  await logActivity(ctx.supabase, { workspaceId: ctx.workspace.id, entityType: "client", action: "imported", meta: { count: imported } });
  revalidatePath("/admin/clients");
  return { done: { imported, skipped: r.rows.length - imported } };
}
