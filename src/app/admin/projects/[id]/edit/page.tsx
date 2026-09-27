import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { ProjectForm } from "../../project-form";
import { updateProjectAction } from "../../actions";
import type { CustomFieldDef } from "@/lib/custom-fields";

export default async function EditProjectPage({ params }: PageProps<"/admin/projects/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await requireOwner();
  const [{ data: project }, { data: clients }, { data: defs }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("settings_custom_fields").select("id, entity, key, label, type, options").eq("entity", "project").order("created_at"),
  ]);
  if (!project) notFound();
  return (
    <>
      <PageHeader title={`Edit ${project.name}`} back={{ href: `/admin/projects/${id}`, label: project.name }} />
      <ProjectForm
        action={updateProjectAction.bind(null, id)}
        values={project}
        clients={clients ?? []}
        customDefs={(defs ?? []) as CustomFieldDef[]}
      />
    </>
  );
}
