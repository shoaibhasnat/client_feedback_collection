import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { assertWritable } from "@/lib/auth";
import { CLIENT_CSV_COLUMNS } from "@/lib/clients-csv";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import clients" };

export default async function ImportClientsPage() {
  await assertWritable();
  return (
    <>
      <PageHeader title="Import clients" description="Add many clients at once from a spreadsheet." back={{ href: "/admin/clients", label: "Clients" }} />
      <div className="max-w-3xl space-y-6">
        <ImportForm />
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Columns</p>
          <p className="mt-1">
            Only <code>name</code> is required. Recognised: {CLIENT_CSV_COLUMNS.map((c) => <code key={c} className="mr-1">{c}</code>)}
            plus your custom client fields (by key or label). Put several emails or tags in one cell separated by “;”.
            Dates use <code>YYYY-MM-DD</code>. <code>source</code> is upwork, referral, direct or other; <code>status</code> is active, past,
            prospect or do_not_contact.
          </p>
          <p className="mt-2">
            Tip: <a href="/admin/clients/export" className="font-medium text-slate-900 underline" download>export your clients</a> to get a file in the right format.
            Rows whose email already belongs to a client are skipped, never merged.
          </p>
        </div>
      </div>
    </>
  );
}
