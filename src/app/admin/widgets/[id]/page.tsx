import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/client";
import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { parseWidgetConfig } from "@/lib/widget/config";
import { deleteWidgetAction } from "../actions";
import { WidgetBuilder } from "./widget-builder";

export default async function WidgetPage({ params }: PageProps<"/admin/widgets/[id]">) {
  const { id } = await params;
  const { supabase, workspace, readOnly } = await requireOwner();
  const [{ data: widget }, { data: ws }, { data: tags }, { data: collections }, { count: published }] = await Promise.all([
    supabase.from("widgets").select("id, name, config").eq("id", id).maybeSingle(),
    supabase.from("workspaces").select("public_key").eq("id", workspace.id).single(),
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("collections").select("id, name").order("name"),
    supabase.from("testimonials").select("id", { count: "exact", head: true }).eq("visibility", "published"),
  ]);
  if (!widget || !ws) notFound();


  return (
    <>
      <PageHeader title={widget.name} back={{ href: "/admin/widgets", label: "Widgets" }} />
      <WidgetBuilder
        id={widget.id}
        initialName={widget.name}
        initialConfig={parseWidgetConfig(widget.config)}
        publishedCount={published ?? 0}
        tags={tags ?? []}
        collections={collections ?? []}
        appUrl={env.appUrl}
        publicKey={ws.public_key}
        readOnly={readOnly}
      />
      {!readOnly && (
        <form action={deleteWidgetAction.bind(null, id)} className="mt-8">
          <ConfirmSubmit message="Delete this widget? Websites using its snippet will show nothing.">Delete widget</ConfirmSubmit>
        </form>
      )}
    </>
  );
}
