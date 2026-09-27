"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertWritable } from "@/lib/auth";
import { revalidateWidget } from "@/lib/site/cache";
import { DEFAULT_WIDGET_CONFIG, widgetConfigSchema, type WidgetConfig } from "@/lib/widget/config";

export type WidgetResult = { ok: boolean; error?: string };

export async function createWidgetAction(formData: FormData) {
  const ctx = await assertWritable();
  const name = z.string().trim().min(1).max(80).safeParse(formData.get("name"));
  const { data, error } = await ctx.supabase
    .from("widgets")
    .insert({ workspace_id: ctx.workspace.id, name: name.success ? name.data : "Widget", config: DEFAULT_WIDGET_CONFIG })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/admin/widgets");
  redirect(`/admin/widgets/${data.id}`);
}

export async function saveWidgetAction(id: string, input: { name: string; config: WidgetConfig }): Promise<WidgetResult> {
  const ctx = await assertWritable();
  const name = z.string().trim().min(1, "Give the widget a name.").max(80).safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  // Strict parse here (the public side parses leniently): reject anything that isn't a valid setting.
  const config = widgetConfigSchema.safeParse(input.config);
  if (!config.success) return { ok: false, error: "Some widget settings are invalid." };
  const c = config.data;
  if ((c.source.type === "tag" || c.source.type === "collection") && !c.source.id) {
    return { ok: false, error: `Choose a ${c.source.type} to show.` };
  }
  // The referenced tag/collection must be this workspace's (RLS hides everyone else's).
  if (c.source.type === "tag" || c.source.type === "collection") {
    const table = c.source.type === "tag" ? "tags" : "collections";
    const { data } = await ctx.supabase.from(table).select("id").eq("id", c.source.id!).maybeSingle();
    if (!data) return { ok: false, error: `That ${c.source.type} no longer exists.` };
  } else {
    c.source.id = null;
  }
  const { error } = await ctx.supabase.from("widgets").update({ name: name.data, config: c }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateWidget(id);
  revalidatePath("/admin/widgets");
  return { ok: true };
}

export async function deleteWidgetAction(id: string) {
  const ctx = await assertWritable();
  await ctx.supabase.from("widgets").delete().eq("id", id);
  revalidateWidget(id);
  revalidatePath("/admin/widgets");
  redirect("/admin/widgets");
}
