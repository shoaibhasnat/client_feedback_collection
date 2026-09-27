import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth";
import type { CustomFieldDef } from "@/lib/custom-fields";
import { CustomFieldsEditor } from "./fields-editor";

export const metadata: Metadata = { title: "Custom fields" };

export default async function CustomFieldsPage() {
  const { supabase, readOnly } = await requireOwner();
  const { data } = await supabase.from("settings_custom_fields").select("id, entity, key, label, type, options").order("created_at");
  const defs = (data ?? []) as CustomFieldDef[];
  return <CustomFieldsEditor defs={defs} readOnly={readOnly} />;
}
