import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { parseWidgetConfig, WIDGET_LAYOUT_LABELS } from "@/lib/widget/config";
import { formatDate } from "@/lib/utils";
import { createWidgetAction } from "./actions";

export const metadata: Metadata = { title: "Widgets" };

const SOURCE_LABEL = { all: "All published", featured: "Featured", tag: "One tag", collection: "A collection" } as const;

export default async function WidgetsPage() {
  const { supabase, readOnly } = await requireOwner();
  const { data } = await supabase.from("widgets").select("id, name, config, updated_at").order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Widgets" description="Embed your testimonials on any website or portfolio with a copy-paste snippet." />
      {!readOnly && (
        <Card className="mb-6">
          <CardHeader title="New widget" />
          <form action={createWidgetAction} className="flex flex-wrap items-end gap-3 p-5">
            <label className="min-w-64 flex-1 text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Name</span>
              <Input name="name" required maxLength={80} placeholder="e.g. Portfolio homepage" />
            </label>
            <Button>Create widget</Button>
          </form>
        </Card>
      )}
      {!data?.length ? (
        <EmptyState title="No widgets yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((w) => {
            const c = parseWidgetConfig(w.config);
            return (
              <Link key={w.id} href={`/admin/widgets/${w.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400">
                <p className="font-semibold text-slate-900">{w.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {WIDGET_LAYOUT_LABELS[c.layout]} · {SOURCE_LABEL[c.source.type]} · updated {formatDate(w.updated_at)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
