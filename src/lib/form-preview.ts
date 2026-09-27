import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFormBranding } from "@/lib/public-form";
import { buildSnapshot } from "@/lib/form/snapshot";
import { estimateMinutes } from "@/lib/form/steps";
import type { FormItemRow, TemplateCopy, TemplateSettings } from "@/lib/form/types";

/** Sample data so the builder preview reads naturally without touching a real client. */
const SAMPLE_CLIENT = {
  name: "Alex Sample",
  company: "Sample Co",
  job_title: "Founder",
  emails: ["alex@sample.test"],
  website: "https://sample.test",
  country: "United Kingdom",
  custom_fields: {},
  form_defaults: {},
};
const SAMPLE_PROJECT = { name: "Website redesign", outcomes: "Launched two weeks early", custom_fields: {} };

/** Everything the dashboard needs to render a template exactly as a client would see it. */
export async function templatePreview(supabase: SupabaseClient, workspaceId: string, templateId: string) {
  const [{ data: template }, { data: items }, { data: settings }] = await Promise.all([
    supabase.from("form_templates").select("id, name, settings, copy").eq("id", templateId).single(),
    supabase.from("form_items").select("*").eq("template_id", templateId),
    supabase.from("site_settings").select("profile").eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (!template) return null;
  const profile = (settings?.profile ?? {}) as Record<string, string | null>;
  const { snapshot } = buildSnapshot({
    template: {
      id: template.id,
      name: template.name,
      settings: template.settings as Partial<TemplateSettings>,
      copy: template.copy as TemplateCopy,
    },
    items: (items ?? []) as FormItemRow[],
    client: SAMPLE_CLIENT,
    project: SAMPLE_PROJECT,
    owner: { name: profile.name ?? "", photo_url: profile.photo_url ?? null, tagline: profile.tagline ?? "", share_url: profile.share_url ?? "" },
  });
  const branding = await loadFormBranding(workspaceId, snapshot.owner.photo_url);
  return {
    snapshot: { ...snapshot, owner: { ...snapshot.owner, name: branding.ownerName ?? snapshot.owner.name } },
    theme: branding.theme,
    ownerPhotoUrl: branding.ownerPhotoUrl,
    shareUrl: branding.shareUrl,
    minutes: estimateMinutes(snapshot),
  };
}

export type PreviewData = NonNullable<Awaited<ReturnType<typeof templatePreview>>>;
