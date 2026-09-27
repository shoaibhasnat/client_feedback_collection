"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { revalidateSite } from "@/lib/site/cache";
import { slugify } from "@/lib/utils";

export type CollectionResult = { ok: boolean; error?: string };

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Use lowercase letters, numbers and dashes.");

function refresh(workspaceId: string, id?: string) {
  revalidatePath("/admin/collections");
  if (id) revalidatePath(`/admin/collections/${id}`);
  revalidateSite(workspaceId);
}

export async function createCollectionAction(formData: FormData) {
  const ctx = await assertWritable();
  const name = z.string().trim().min(1).max(80).safeParse(formData.get("name"));
  if (!name.success) redirect("/admin/collections?error=" + encodeURIComponent("Give the collection a name."));

  const { data: existing } = await ctx.supabase.from("collections").select("slug");
  const taken = new Set((existing ?? []).map((c) => c.slug));
  const base = slugify(name.data) || "collection";
  let slug = base;
  for (let i = 2; taken.has(slug); i += 1) slug = `${base}-${i}`;

  const { data, error } = await ctx.supabase
    .from("collections")
    .insert({ workspace_id: ctx.workspace.id, name: name.data, slug })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  refresh(ctx.workspace.id);
  redirect(`/admin/collections/${data.id}`);
}

export async function updateCollectionAction(id: string, input: { name: string; slug: string; intro_text: string }): Promise<CollectionResult> {
  const ctx = await assertWritable();
  const parsed = z
    .object({ name: z.string().trim().min(1, "Give the collection a name.").max(80), slug: slugSchema, intro_text: z.string().trim().max(2000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase
    .from("collections")
    .update({ ...parsed.data, intro_text: parsed.data.intro_text || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "Another collection already uses that address." : error.message };
  refresh(ctx.workspace.id, id);
  return { ok: true };
}

/** Replace the collection's items with `ids`, in this order. */
export async function setCollectionItemsAction(id: string, ids: string[]): Promise<CollectionResult> {
  const ctx = await assertWritable();
  const parsed = z.array(z.uuid()).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid selection." };
  const unique = [...new Set(parsed.data)];
  const { data: found } = await ctx.supabase.from("testimonials").select("id").in("id", unique.length ? unique : ["00000000-0000-0000-0000-000000000000"]);
  const allowed = new Set((found ?? []).map((t) => t.id));

  await ctx.supabase.from("collection_items").delete().eq("collection_id", id);
  const rows = unique
    .filter((t) => allowed.has(t))
    .map((testimonial_id, i) => ({ workspace_id: ctx.workspace.id, collection_id: id, testimonial_id, sort_order: (i + 1) * 10 }));
  if (rows.length) {
    const { error } = await ctx.supabase.from("collection_items").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  refresh(ctx.workspace.id, id);
  return { ok: true };
}

export async function deleteCollectionAction(id: string) {
  const ctx = await assertWritable();
  await ctx.supabase.from("collections").delete().eq("id", id);
  refresh(ctx.workspace.id);
  redirect("/admin/collections");
}
