import type { Metadata } from "next";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { ProjectForm } from "../project-form";
import { createProjectAction } from "../actions";
import type { CustomFieldDef } from "@/lib/custom-fields";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/admin/projects/new">) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const [{ data: clients }, { data: defs }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("settings_custom_fields").select("id, entity, key, label, type, options").eq("entity", "project").order("created_at"),
  ]);
  const clientId = typeof sp.client === "string" ? sp.client : undefined;

  return (
    <>
      <PageHeader title="New project" back={{ href: clientId ? `/admin/clients/${clientId}` : "/admin/projects", label: "Back" }} />
      {!clients?.length ? (
        <EmptyState title="Add a client first.">
          <LinkButton href="/admin/clients/new" className="mt-3">
            Add client
          </LinkButton>
        </EmptyState>
      ) : (
        <ProjectForm
          action={createProjectAction}
          clients={clients}
          values={{ client_id: clientId }}
          isNew
          customDefs={(defs ?? []) as CustomFieldDef[]}
        />
      )}
    </>
  );
}
