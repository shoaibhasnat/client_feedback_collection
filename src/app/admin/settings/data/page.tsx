import type { Metadata } from "next";
import { buttonClass, Card, CardHeader, LinkButton } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { EXPORT_TABLES } from "@/lib/export";

export const metadata: Metadata = { title: "Data · Settings" };

export default async function DataSettingsPage() {
  const { supabase, readOnly } = await requireOwner();
  const [{ count: clients }, { count: testimonials }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("testimonials").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Export all data" description="Everything in your workspace, as JSON and CSV, in one ZIP file." />
        <div className="space-y-3 p-5 text-sm text-slate-600">
          <p>
            Includes all {EXPORT_TABLES.length} tables ({clients ?? 0} clients, {testimonials ?? 0} testimonials, requests, submissions, notes, tags,
            collections, widgets, settings, theme history and activity) and a list of every uploaded file with a download link valid for 7 days.
            Request links and approval tokens are left out because they work like passwords.
          </p>
          <a href="/admin/settings/data/export" className={buttonClass("primary", "md")} download>
            Download data (ZIP)
          </a>
        </div>
      </Card>
      <Card>
        <CardHeader title="Download all media" description="Every photo, logo, attachment, video and image in one ZIP. Can be large." />
        <div className="p-5">
          <a href="/admin/settings/data/media" className={buttonClass("outline", "md")} download>
            Download media (ZIP)
          </a>
        </div>
      </Card>
      <Card>
        <CardHeader title="Clients CSV" description="Edit your client list in a spreadsheet, or bring clients over from another tool." />
        <div className="flex flex-wrap gap-2 p-5">
          <a href="/admin/clients/export" className={buttonClass("outline", "md")} download>
            Export clients (CSV)
          </a>
          {!readOnly && (
            <LinkButton href="/admin/clients/import" variant="outline">
              Import clients from CSV
            </LinkButton>
          )}
        </div>
      </Card>
    </div>
  );
}
