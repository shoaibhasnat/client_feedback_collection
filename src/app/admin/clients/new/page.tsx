import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { ClientForm } from "../client-form";
import { createClientAction } from "../actions";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const { supabase } = await requireOwner();
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  return (
    <>
      <PageHeader title="New client" back={{ href: "/admin/clients", label: "Clients" }} />
      <ClientForm action={createClientAction} otherClients={clients ?? []} isNew />
    </>
  );
}
