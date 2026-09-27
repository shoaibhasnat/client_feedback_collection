import { requireOwner } from "@/lib/auth";
import { CLIENT_CSV_COLUMNS, clientExportRow } from "@/lib/clients-csv";
import { toCsv } from "@/lib/csv";
import type { CustomFieldDef } from "@/lib/custom-fields";

/** All of this workspace's clients as CSV (brief §4.2). RLS limits every query to the owner's workspace. */
export async function GET() {
  const { supabase, workspace } = await requireOwner();
  const [{ data: defs }, { data: tags }] = await Promise.all([
    supabase.from("settings_custom_fields").select("id, entity, key, label, type, options").eq("entity", "client").order("created_at"),
    supabase.from("tags").select("id, name"),
  ]);
  const tagName = new Map((tags ?? []).map((t) => [t.id, t.name as string]));

  const clients: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("clients").select("*, client_tags(tag_id)").order("name").range(from, from + 999);
    if (error) return new Response(error.message, { status: 500 });
    clients.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const customDefs = (defs ?? []) as CustomFieldDef[];
  const csv = toCsv(
    [...CLIENT_CSV_COLUMNS, ...customDefs.map((d) => d.key)],
    clients.map((c) =>
      clientExportRow(
        c,
        ((c.client_tags as { tag_id: string }[]) ?? []).map((t) => tagName.get(t.tag_id)).filter((n): n is string => Boolean(n)),
        customDefs,
      ),
    ),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${workspace.slug}-clients-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
