import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Button, Card, CardHeader, EmptyState, Input, PageHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { createCollectionAction } from "./actions";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsPage({ searchParams }: PageProps<"/admin/collections">) {
  const sp = await searchParams;
  const { supabase, workspace, readOnly } = await requireOwner();
  const { data } = await supabase.from("collections").select("id, name, slug, intro_text, collection_items(count)").order("created_at", { ascending: false });
  const count = (rel: unknown) => (Array.isArray(rel) ? ((rel[0] as { count?: number })?.count ?? 0) : 0);

  return (
    <>
      <PageHeader
        title="Collections"
        description="Hand-picked sets of testimonials with their own link — useful for a specific proposal or niche."
      />
      {typeof sp.error === "string" && (
        <Alert tone="red" className="mb-4">
          {sp.error}
        </Alert>
      )}
      {!readOnly && (
        <Card className="mb-6">
          <CardHeader title="New collection" />
          <form action={createCollectionAction} className="flex flex-wrap items-end gap-3 p-5">
            <label className="min-w-64 flex-1 text-sm">
              <span className="mb-1.5 block font-medium text-slate-700">Name</span>
              <Input name="name" required maxLength={80} placeholder="e.g. E-commerce stores" />
            </label>
            <Button>Create collection</Button>
          </form>
        </Card>
      )}
      {!data?.length ? (
        <EmptyState title="No collections yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c) => (
            <Link key={c.id} href={`/admin/collections/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-400">
              <p className="font-semibold text-slate-900">{c.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {count(c.collection_items)} testimonials · {env.appUrl.replace(/^https?:\/\//, "")}/{workspace.slug}/c/{c.slug}
              </p>
              {c.intro_text && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{c.intro_text}</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
