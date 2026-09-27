import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { ClientForm } from "../client-form";
import { createClientAction } from "../actions";
import type { CustomFieldDef } from "@/lib/custom-fields";
import type { Tag } from "@/lib/tags";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const { supabase } = await requireOwner();
  const [{ data: clients }, { data: defs }, { data: tags }] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("settings_custom_fields").select("id, entity, key, label, type, options").eq("entity", "client").order("created_at"),
    supabase.from("tags").select("id, name, type, color").order("name"),
  ]);
  return (
    <>
      <PageHeader title="New client" back={{ href: "/admin/clients", label: "Clients" }} />
      <ClientForm
        action={createClientAction}
        otherClients={clients ?? []}
        isNew
        customDefs={(defs ?? []) as CustomFieldDef[]}
        tags={(tags ?? []) as Tag[]}
      />
    </>
  );
}
