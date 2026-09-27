import { notFound, redirect } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOwner } from "@/lib/auth";
import { signPaths } from "@/lib/uploads";
import { deleteTestimonialAction, saveManualAction } from "../actions";
import { ManualTestimonialForm } from "../manual-form";

export default async function EditTestimonialPage({ params, searchParams }: PageProps<"/admin/testimonials/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, readOnly } = await requireOwner();
  const { data: t } = await supabase.from("testimonials").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  if (t.submission_id) redirect(`/admin/testimonials/review/${t.submission_id}`);

  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  const isLink = typeof t.proof_url === "string" && /^https?:\/\//.test(t.proof_url);
  const sign = await signPaths(supabase, [isLink ? null : t.proof_url]);

  return (
    <>
      <PageHeader title="Edit testimonial" back={{ href: "/admin/testimonials?view=all", label: "Testimonials" }} />
      {sp.saved === "1" && (
        <Alert tone="green" className="mb-4 max-w-2xl">
          Saved.
        </Alert>
      )}
      <ManualTestimonialForm
        action={saveManualAction.bind(null, id)}
        clients={clients ?? []}
        meta={{ client_id: t.client_id, source: t.source, proof_link: isLink ? t.proof_url : null }}
        proofUrl={isLink ? null : sign(t.proof_url)}
        initial={t}
      />
      {!readOnly && (
        <form action={deleteTestimonialAction.bind(null, id)} className="mt-6">
          <ConfirmSubmit message="Delete this testimonial?">Delete testimonial</ConfirmSubmit>
        </form>
      )}
    </>
  );
}
