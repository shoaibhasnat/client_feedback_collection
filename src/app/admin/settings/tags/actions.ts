"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { TAG_COLORS } from "@/lib/tags";

export type TagResult = { ok: boolean; error?: string };

const tagSchema = z.object({
  name: z.string().trim().min(1, "Give the tag a name.").max(50),
  type: z.enum(["service", "industry", "platform", "result", "other"]),
  color: z.enum(TAG_COLORS),
});

function refresh() {
  revalidatePath("/admin", "layout");
}

const duplicate = (code?: string) => (code === "23505" ? "A tag with that name already exists." : undefined);

export async function createTagAction(input: unknown): Promise<TagResult> {
  const ctx = await assertWritable();
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("tags").insert({ ...parsed.data, workspace_id: ctx.workspace.id });
  if (error) return { ok: false, error: duplicate(error.code) ?? error.message };
  refresh();
  return { ok: true };
}

export async function updateTagAction(id: string, input: unknown): Promise<TagResult> {
  const ctx = await assertWritable();
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase.from("tags").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: duplicate(error.code) ?? error.message };
  refresh();
  return { ok: true };
}

/** Move every use of `sourceId` onto `targetId`, then delete the source tag. */
export async function mergeTagsAction(sourceId: string, targetId: string): Promise<TagResult> {
  const ctx = await assertWritable();
  if (sourceId === targetId) return { ok: false, error: "Pick a different tag to merge into." };
  const { data: both } = await ctx.supabase.from("tags").select("id").in("id", [sourceId, targetId]);
  if ((both ?? []).length !== 2) return { ok: false, error: "Tag not found." };

  const [{ data: tTags }, { data: cTags }] = await Promise.all([
    ctx.supabase.from("testimonial_tags").select("testimonial_id").eq("tag_id", sourceId),
    ctx.supabase.from("client_tags").select("client_id").eq("tag_id", sourceId),
  ]);
  if (tTags?.length) {
    const { error } = await ctx.supabase.from("testimonial_tags").upsert(
      tTags.map((t) => ({ workspace_id: ctx.workspace.id, testimonial_id: t.testimonial_id, tag_id: targetId })),
      { onConflict: "testimonial_id,tag_id", ignoreDuplicates: true },
    );
    if (error) return { ok: false, error: error.message };
  }
  if (cTags?.length) {
    const { error } = await ctx.supabase.from("client_tags").upsert(
      cTags.map((c) => ({ workspace_id: ctx.workspace.id, client_id: c.client_id, tag_id: targetId })),
      { onConflict: "client_id,tag_id", ignoreDuplicates: true },
    );
    if (error) return { ok: false, error: error.message };
  }
  // Deleting the source cascades its remaining assignment rows.
  const { error } = await ctx.supabase.from("tags").delete().eq("id", sourceId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function deleteTagAction(id: string): Promise<TagResult> {
  const ctx = await assertWritable();
  const { error } = await ctx.supabase.from("tags").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}
