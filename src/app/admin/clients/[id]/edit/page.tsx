import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { signPaths } from "@/lib/uploads";
import { ClientForm } from "../../client-form";
import { updateClientAction } from "../../actions";
import type { CustomFieldDef } from "@/lib/custom-fields";
import type { Tag } from "@/lib/tags";

export default async function EditClientPage({ params, searchParams }: PageProps<"/admin/clients/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const [{ data: client }, { data: clients }, { data: defs }, { data: tags }, { data: clientTags }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, name").neq("id", id).order("name"),
    supabase.from("settings_custom_fields").select("id, entity, key, label, type, options").eq("entity", "client").order("created_at"),
    supabase.from("tags").select("id, name, type, color").order("name"),
    supabase.from("client_tags").select("tag_id").eq("client_id", id),
  ]);
  if (!client) notFound();
  const sign = await signPaths(supabase, [client.photo_url, client.logo_url]);

  return (
    <>
      <PageHeader title={`Edit ${client.name}`} back={{ href: `/admin/clients/${id}`, label: client.name }} />
      <ClientForm
        action={updateClientAction.bind(null, id)}
        values={{ ...client, photo_signed: sign(client.photo_url), logo_signed: sign(client.logo_url) }}
        otherClients={clients ?? []}
        customDefs={(defs ?? []) as CustomFieldDef[]}
        tags={(tags ?? []) as Tag[]}
        selectedTags={(clientTags ?? []).map((t) => t.tag_id)}
        imageError={typeof sp.image_error === "string" ? `Client saved, but the image wasn't: ${sp.image_error}` : undefined}
      />
    </>
  );
}
