import type { Metadata } from "next";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import type { FormItemRow } from "@/lib/form/types";
import { humanize } from "@/lib/utils";

export const metadata: Metadata = { title: "Forms" };

const SECTIONS = [
  { key: "question", title: "Guided questions" },
  { key: "about", title: "About you fields" },
  { key: "contact", title: "Contact fields (private)" },
] as const;

export default async function FormsPage() {
  const { supabase } = await requireOwner();
  const { data: templates } = await supabase
    .from("form_templates")
    .select("id, name, is_default, settings, form_items(*)")
    .is("archived_at", null)
    .order("is_default", { ascending: false });

  return (
    <>
      <PageHeader title="Forms" description="The questions and fields your clients see." />
      <Alert tone="blue" className="mb-6">
        The form builder (add, edit, reorder and archive questions and fields, plus multiple templates) arrives in the next
        phase. Your workspace starts with the default template below.
      </Alert>
      <div className="space-y-6">
        {(templates ?? []).map((t) => {
          const items = ((t.form_items ?? []) as FormItemRow[]).filter((i) => !i.archived_at);
          const settings = t.settings as Record<string, unknown>;
          return (
            <Card key={t.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {t.name} {t.is_default && <Badge tone="green">Default</Badge>}
                  </span>
                }
                description={`Rating ${settings.rating_enabled ? "on" : "off"} · video ${settings.video_enabled ? "on" : "off (coming later)"}`}
              />
              <div className="grid gap-6 p-5 md:grid-cols-3">
                {SECTIONS.map((section) => (
                  <div key={section.key}>
                    <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                    <ol className="mt-2 space-y-2 text-sm">
                      {items
                        .filter((i) => i.section === section.key)
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((i) => (
                          <li key={i.id} className="rounded-lg border border-slate-100 px-3 py-2">
                            <p className="text-slate-800">{i.label}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {humanize(i.type)} · {i.required ? "required" : "optional"}
                              {i.maps_to_client_field && ` · fills client.${i.maps_to_client_field}`}
                            </p>
                          </li>
                        ))}
                    </ol>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
