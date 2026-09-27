import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { prefillChoices } from "@/lib/form-customize";
import { baselineSettings, cleanOverrideMap } from "@/lib/form/settings";
import { buildSnapshot, type ClientRecord } from "@/lib/form/snapshot";
import type { FormItemRow, TemplateCopy, TemplateSettings } from "@/lib/form/types";
import { PreferencesEditor } from "./preferences-editor";

export default async function ClientFormPreferencesPage({ params, searchParams }: PageProps<"/admin/clients/[id]/form-preferences">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, readOnly } = await requireOwner();

  const [{ data: client }, { data: templates }, choices] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("form_templates").select("id, name, is_default, settings, copy").is("archived_at", null).order("is_default", { ascending: false }),
    prefillChoices(supabase),
  ]);
  if (!client || !templates?.length) notFound();

  const template = templates.find((t) => t.id === sp.template) ?? templates[0];
  const { data: items } = await supabase.from("form_items").select("*").eq("template_id", template.id).is("archived_at", null).order("sort_order");
  const rows = (items ?? []) as FormItemRow[];
  const templateSettings = template.settings as Partial<TemplateSettings>;
  const clientDefaults = cleanOverrideMap(client.form_defaults);

  // Template-only baseline marks what this client overrides; current = template + client defaults.
  const templateBaseline = baselineSettings(rows, templateSettings, {});
  const current = baselineSettings(rows, templateSettings, clientDefaults);
  const { snapshot } = buildSnapshot({
    template: { id: template.id, name: template.name, settings: templateSettings, copy: template.copy as TemplateCopy },
    items: rows,
    client: client as ClientRecord,
    project: null,
    owner: { name: "", photo_url: null, tagline: "", share_url: "" },
  });

  return (
    <>
      <PageHeader
        title={`Form preferences · ${client.name}`}
        description="Defaults for every future request to this client. Each request can still be adjusted when you create it. Requests already sent are not affected."
        back={{ href: `/admin/clients/${id}`, label: client.name }}
      />
      <PreferencesEditor
        key={template.id}
        clientId={id}
        templates={templates.map((t) => ({ id: t.id, name: t.name, is_default: t.is_default }))}
        templateId={template.id}
        rows={rows.map((r) => ({ key: r.key, label: r.label, section: r.section, type: r.type, options: r.options, maps_to_client_field: r.maps_to_client_field }))}
        templateBaseline={templateBaseline}
        current={current}
        prefillValues={Object.fromEntries(snapshot.items.map((i) => [i.key, i.prefill_value]))}
        choices={choices}
        readOnly={readOnly}
      />
    </>
  );
}
