import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { deleteCollectionAction } from "../actions";
import { CollectionEditor, type PickRow } from "./collection-editor";

export default async function CollectionPage({ params }: PageProps<"/admin/collections/[id]">) {
  const { id } = await params;
  const { supabase, workspace, readOnly } = await requireOwner();
  const [{ data: collection }, { data: items }, { data: testimonials }] = await Promise.all([
    supabase.from("collections").select("id, name, slug, intro_text").eq("id", id).maybeSingle(),
    supabase.from("collection_items").select("testimonial_id").eq("collection_id", id).order("sort_order"),
    supabase
      .from("testimonials")
      .select("id, display_quote, display_name, display_company, visibility, rating, clients(name)")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (!collection) notFound();

  const rows: PickRow[] = (testimonials ?? []).map((t) => ({
    id: t.id,
    quote: t.display_quote ?? "",
    name: t.display_name ?? (t.clients as unknown as { name: string } | null)?.name ?? "—",
    company: t.display_company,
    visibility: t.visibility,
    rating: t.rating,
  }));

  return (
    <>
      <PageHeader title={collection.name} back={{ href: "/admin/collections", label: "Collections" }} />
      <CollectionEditor
        collection={collection}
        publicUrl={`${env.appUrl}/${workspace.slug}/c/`}
        selectedIds={(items ?? []).map((i) => i.testimonial_id)}
        rows={rows}
        readOnly={readOnly}
      />
      {!readOnly && (
        <form action={deleteCollectionAction.bind(null, id)} className="mt-8">
          <ConfirmSubmit message="Delete this collection? The testimonials themselves are kept.">Delete collection</ConfirmSubmit>
        </form>
      )}
    </>
  );
}
