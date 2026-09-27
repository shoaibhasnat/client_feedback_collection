import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { archiveTemplateAction, createTemplateAction } from "./actions";

export const metadata: Metadata = { title: "Forms" };

type TemplateRow = {
  id: string;
  name: string;
  is_default: boolean;
  archived_at: string | null;
  updated_at: string;
  form_items: { section: string; archived_at: string | null }[];
};

export default async function FormsPage({ searchParams }: PageProps<"/admin/forms">) {
  const sp = await searchParams;
  const { supabase, readOnly } = await requireOwner();
  const { data } = await supabase
    .from("form_templates")
    .select("id, name, is_default, archived_at, updated_at, form_items(section, archived_at)")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  const templates = (data ?? []) as TemplateRow[];
  const active = templates.filter((t) => !t.archived_at);
  const archived = templates.filter((t) => t.archived_at);

  const count = (t: TemplateRow, section: string) =>
    t.form_items.filter((i) => i.section === section && !i.archived_at).length;

  return (
    <>
      <PageHeader
        title="Forms"
        description="Templates control the questions and fields your clients see. Edits apply to requests created afterwards; links already sent keep the version they were sent with."
      />
      {typeof sp.error === "string" && (
        <Alert tone="red" className="mb-4">
          {sp.error}
        </Alert>
      )}

      {!readOnly && (
        <Card className="mb-6">
          <CardHeader title="New template" description="Starts with the default template's About You and Contact fields, and no questions." />
          <form action={createTemplateAction} className="flex flex-wrap items-end gap-3 p-5">
            <label className="min-w-64 flex-1 text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Template name</span>
              <Input name="name" required maxLength={80} placeholder="e.g. Short, Long-term client" />
            </label>
            <Button>Create template</Button>
          </form>
        </Card>
      )}

      {active.length === 0 ? (
        <EmptyState title="No templates." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {active.map((t) => (
            <Link key={t.id} href={`/admin/forms/${t.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{t.name}</p>
                {t.is_default && <Badge tone="green">Default</Badge>}
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {count(t, "question")} questions · {count(t, "about")} About You fields · {count(t, "contact")} Contact fields
              </p>
              <p className="mt-1 text-xs text-slate-500">Updated {formatDate(t.updated_at, true)}</p>
            </Link>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <Card className="mt-8">
          <CardHeader title="Archived templates" />
          <ul className="divide-y divide-slate-100">
            {archived.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="text-slate-600">{t.name}</span>
                {!readOnly && (
                  <form action={archiveTemplateAction.bind(null, t.id, false)}>
                    <Button variant="outline" size="sm">
                      Restore
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
