import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { templatePreview } from "@/lib/form-preview";
import type { FormItemRow, TemplateCopy, TemplateSettings } from "@/lib/form/types";
import { FormBuilder } from "./builder";

export default async function FormBuilderPage({ params, searchParams }: PageProps<"/admin/forms/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, workspace, readOnly } = await requireOwner();

  const [{ data: template }, { data: items }, { data: customFields }, preview] = await Promise.all([
    supabase.from("form_templates").select("id, name, is_default, archived_at, settings, copy").eq("id", id).maybeSingle(),
    supabase.from("form_items").select("*").eq("template_id", id).order("sort_order"),
    supabase.from("settings_custom_fields").select("entity, key, label").order("label"),
    templatePreview(supabase, workspace.id, id),
  ]);
  if (!template || !preview) notFound();

  return (
    <FormBuilder
      template={{
        id: template.id,
        name: template.name,
        is_default: template.is_default,
        archived: Boolean(template.archived_at),
        settings: template.settings as Partial<TemplateSettings>,
        copy: template.copy as TemplateCopy,
      }}
      items={(items ?? []) as FormItemRow[]}
      clientCustomFields={(customFields ?? []).filter((f) => f.entity === "client")}
      projectCustomFields={(customFields ?? []).filter((f) => f.entity === "project")}
      preview={preview}
      readOnly={readOnly}
      error={typeof sp.error === "string" ? sp.error : null}
    />
  );
}
