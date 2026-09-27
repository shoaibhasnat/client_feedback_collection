import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { cleanPresets } from "@/lib/form/settings";
import { MessageTemplatesForm } from "../forms";
import { PresetsEditor } from "./presets-editor";

export const metadata: Metadata = { title: "Messages & presets" };

export default async function MessagesSettingsPage() {
  const { supabase, workspace, readOnly } = await requireOwner();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("message_templates, form_presets")
    .eq("workspace_id", workspace.id)
    .single();
  const templates = (settings?.message_templates ?? {}) as Record<string, string | number>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Message templates"
          description="Used by the copy buttons on each request. Variables: {client_first_name}, {project_name}, {owner_name}, {link}."
        />
        <div className="p-5">
          <MessageTemplatesForm
            values={{
              upwork: String(templates.upwork ?? ""),
              email: String(templates.email ?? ""),
              whatsapp: String(templates.whatsapp ?? ""),
              reminder: String(templates.reminder ?? ""),
              reminder_days: Number(templates.reminder_days ?? 3),
            }}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Form presets" description="One-click starting points on the “Customize form” step of a new request." />
        <div className="p-5">
          <PresetsEditor initial={cleanPresets(settings?.form_presets)} readOnly={readOnly} />
        </div>
      </Card>
    </div>
  );
}
