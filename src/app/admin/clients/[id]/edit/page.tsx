import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { signPaths } from "@/lib/uploads";
import { ClientForm } from "../../client-form";
import { updateClientAction } from "../../actions";

export default async function EditClientPage({ params, searchParams }: PageProps<"/admin/clients/[id]/edit">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const [{ data: client }, { data: clients }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id, name").neq("id", id).order("name"),
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
        imageError={typeof sp.image_error === "string" ? `Client saved, but the image wasn't: ${sp.image_error}` : undefined}
      />
    </>
  );
}
