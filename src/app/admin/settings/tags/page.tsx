import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import type { Tag } from "@/lib/tags";
import { TagsEditor } from "./tags-editor";

export const metadata: Metadata = { title: "Tags" };

export default async function TagsSettingsPage() {
  const { supabase, readOnly } = await requireOwner();
  const { data } = await supabase
    .from("tags")
    .select("id, name, type, color, testimonial_tags(count), client_tags(count)")
    .order("name");
  const count = (rel: unknown) => (Array.isArray(rel) ? ((rel[0] as { count?: number })?.count ?? 0) : 0);
  const tags = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    color: t.color,
    testimonials: count(t.testimonial_tags),
    clients: count(t.client_tags),
  })) as (Tag & { testimonials: number; clients: number })[];
  return <TagsEditor tags={tags} readOnly={readOnly} />;
}
