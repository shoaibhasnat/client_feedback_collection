import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { saveManualAction } from "../actions";
import { ManualTestimonialForm } from "../manual-form";

export const metadata: Metadata = { title: "Add testimonial" };

export default async function NewTestimonialPage() {
  const { supabase } = await requireOwner();
  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  return (
    <>
      <PageHeader
        title="Add a testimonial manually"
        description="For example, copy an existing Upwork review and attach a screenshot as proof."
        back={{ href: "/admin/testimonials?view=all", label: "Testimonials" }}
      />
      <ManualTestimonialForm
        action={saveManualAction.bind(null, null)}
        clients={clients ?? []}
        meta={{ client_id: null, source: "upwork_review", proof_link: null }}
        proofUrl={null}
        initial={{
          display_quote: "",
          headline: null,
          display_name: null,
          display_role: null,
          display_company: null,
          rating: 5,
          date: new Date().toISOString().slice(0, 10),
          visibility: "hidden",
          featured: false,
        }}
      />
    </>
  );
}
