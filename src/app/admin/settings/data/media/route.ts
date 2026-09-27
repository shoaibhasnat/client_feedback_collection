import { Zip, ZipPassThrough } from "fflate";
import { requireOwner } from "@/lib/auth";
import { listWorkspaceFiles } from "@/lib/export";

/**
 * Every uploaded file of the owner's workspace as one ZIP, streamed file by file (videos are
 * already compressed, so entries are stored without recompression to keep memory and CPU low).
 */
export async function GET() {
  const { supabase, workspace } = await requireOwner();
  const files = await listWorkspaceFiles(supabase, workspace.id);
  const prefix = `${workspace.id}/`;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err);
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      (async () => {
        for (const f of files) {
          const { data } = await supabase.storage.from("uploads").download(f.path);
          if (!data) continue;
          const entry = new ZipPassThrough(f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path);
          zip.add(entry);
          const reader = data.stream().getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            entry.push(value);
          }
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      })().catch((e) => controller.error(e));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${workspace.slug}-media-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
