import { strToU8, zipSync } from "fflate";
import { requireOwner } from "@/lib/auth";
import { objectsToCsv, toCsv } from "@/lib/csv";
import { collectWorkspaceData, listWorkspaceFiles } from "@/lib/export";

const LINK_DAYS = 7;

/**
 * ZIP with every table of the owner's workspace as JSON and CSV, plus a list of all stored files
 * with download links valid for 7 days (brief §4.7, §9 Phase 4).
 */
export async function GET() {
  const { supabase, workspace, user } = await requireOwner();
  const [data, files] = await Promise.all([collectWorkspaceData(supabase), listWorkspaceFiles(supabase, workspace.id)]);

  const signed = new Map<string, string>();
  for (let i = 0; i < files.length; i += 500) {
    const { data: urls } = await supabase.storage
      .from("uploads")
      .createSignedUrls(files.slice(i, i + 500).map((f) => f.path), LINK_DAYS * 86_400);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const now = new Date();
  const media = files.map((f) => ({ ...f, download_url: signed.get(f.path) ?? "" }));
  const entries: Record<string, Uint8Array> = {
    "README.txt": strToU8(
      [
        `Testimonial Collector export: ${workspace.name} (${workspace.slug})`,
        `Created ${now.toISOString()} by ${user.email ?? "owner"}.`,
        "",
        "data.json      every table in one file",
        "csv/*.csv      one CSV per table (JSON columns are written as JSON text)",
        `media.csv      every uploaded file, with a download link valid for ${LINK_DAYS} days`,
        "",
        "Request links and approval tokens are not included: they are secrets, not data.",
        "Use “Download all media” in Settings → Data for the files themselves.",
      ].join("\n"),
    ),
    "data.json": strToU8(JSON.stringify({ exported_at: now.toISOString(), workspace, tables: data, media }, null, 2)),
    "media.csv": strToU8(toCsv(["path", "size", "type", "updated_at", "download_url"], media.map((m) => [m.path, m.size, m.type, m.updated_at, m.download_url]))),
  };
  for (const [table, rows] of Object.entries(data)) entries[`csv/${table}.csv`] = strToU8(rows.length ? objectsToCsv(rows) : "﻿");

  const zip = zipSync(entries, { level: 6 });
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${workspace.slug}-export-${now.toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
