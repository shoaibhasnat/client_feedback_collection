import type { Metadata } from "next";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "New request" };

export default async function NewRequestPage({ searchParams }: PageProps<"/admin/requests/new">) {
  const sp = await searchParams;
  const { supabase } = await requireOwner();
  const [{ data: clients }, { data: projects }, { data: templates }] = await Promise.all([
    supabase.from("clients").select("id, name, status").order("name"),
    supabase.from("projects").select("id, name, client_id").order("created_at", { ascending: false }),
    supabase.from("form_templates").select("id, name, is_default").is("archived_at", null).order("is_default", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader
        title="Request a testimonial"
        description="Creates a private link for one client. Share it yourself by Upwork chat, email or WhatsApp."
        back={{ href: "/admin/requests", label: "Requests" }}
      />
      {!clients?.length ? (
        <EmptyState title="Add a client first.">
          <LinkButton href="/admin/clients/new" className="mt-3">
            Add client
          </LinkButton>
        </EmptyState>
      ) : (
        <NewRequestForm
          clients={clients}
          projects={projects ?? []}
          templates={templates ?? []}
          initialClient={typeof sp.client === "string" ? sp.client : ""}
          initialProject={typeof sp.project === "string" ? sp.project : ""}
        />
      )}
    </>
  );
}
