"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Alert, Button, Card, CardHeader } from "@/components/ui";
import { previewImportAction, runImportAction, type ImportState } from "./actions";

/** Upload → preview (nothing saved) → import. The file stays selected between the two steps. */
export function ImportForm() {
  const [preview, previewAction, previewing] = useActionState<ImportState, FormData>(previewImportAction, {});
  const [result, importAction, importing] = useActionState<ImportState, FormData>(runImportAction, {});
  const p = preview.preview;

  if (result.done && !result.error) {
    return (
      <Alert tone="green">
        Imported {result.done.imported} {result.done.imported === 1 ? "client" : "clients"}
        {result.done.skipped ? ` (${result.done.skipped} skipped)` : ""}.{" "}
        <Link href="/admin/clients" className="font-medium underline">
          View clients
        </Link>
      </Alert>
    );
  }

  return (
    <form className="space-y-6">
      <Card>
        <CardHeader title="1. Choose a CSV file" description="UTF-8 CSV, up to 2 MB and 2,000 rows. The first row must be the column names." />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
            aria-label="CSV file"
          />
          <Button type="submit" variant="outline" formAction={previewAction} disabled={previewing}>
            {previewing ? "Checking…" : "Check file"}
          </Button>
        </div>
        {preview.error && (
          <div className="px-5 pb-5">
            <Alert tone="red">{preview.error}</Alert>
          </div>
        )}
      </Card>

      {p && (
        <Card>
          <CardHeader title="2. Review" description="Nothing has been saved yet." />
          <div className="space-y-4 p-5 text-sm">
            <p>
              <strong>{p.ready}</strong> of {p.total} rows ready to import
              {p.sample.length > 0 && <span className="text-slate-500"> ({p.sample.join(", ")}{p.ready > p.sample.length ? ", …" : ""})</span>}.
            </p>
            {p.unknownColumns.length > 0 && (
              <Alert tone="amber">Ignored columns (not recognised): {p.unknownColumns.join(", ")}</Alert>
            )}
            {p.duplicates.length > 0 && (
              <details>
                <summary className="cursor-pointer font-medium text-amber-800">{p.duplicates.length} skipped: email already exists</summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600">
                  {p.duplicates.slice(0, 50).map((d) => (
                    <li key={d.line}>
                      Row {d.line}: {d.name} (same email as {d.of})
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {p.invalid.length > 0 && (
              <details open>
                <summary className="cursor-pointer font-medium text-red-700">{p.invalid.length} skipped: problems to fix</summary>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600">
                  {p.invalid.slice(0, 50).map((d) => (
                    <li key={d.line}>
                      Row {d.line}: {d.errors.join("; ")}
                    </li>
                  ))}
                </ul>
                {p.invalid.length > 50 && <p className="mt-1 text-slate-500">…and {p.invalid.length - 50} more.</p>}
              </details>
            )}
            {result.error && <Alert tone="red">{result.error}</Alert>}
            <Button type="submit" formAction={importAction} disabled={importing || p.ready === 0}>
              {importing ? "Importing…" : `Import ${p.ready} ${p.ready === 1 ? "client" : "clients"}`}
            </Button>
          </div>
        </Card>
      )}
    </form>
  );
}
