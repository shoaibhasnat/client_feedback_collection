import type { Metadata } from "next";
import { Card, CardHeader, Input, Label } from "@/components/ui";
import { requireOwner } from "@/lib/auth";
import { env } from "@/lib/env";
import { signPaths } from "@/lib/uploads";
import { PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Site & Settings" };

export default async function SettingsPage() {
  const { supabase, workspace } = await requireOwner();
  const { data: settings } = await supabase.from("site_settings").select("profile").eq("workspace_id", workspace.id).single();
  const profile = (settings?.profile ?? {}) as Record<string, unknown>;
  const sign = await signPaths(supabase, [profile.photo_url as string | null]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Your profile" description="Shown on the client form (and later on your public page)." />
        <div className="p-5">
          <ProfileForm
            values={{
              name: (profile.name as string) ?? "",
              tagline: (profile.tagline as string) ?? "",
              services: ((profile.services as string[]) ?? []).join("\n"),
              contact_links: ((profile.contact_links as string[]) ?? []).join("\n"),
              share_url: (profile.share_url as string) ?? "",
              photo: sign(profile.photo_url as string | null),
            }}
          />
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Public page address" description="Set by the app administrator." />
          <div className="p-5">
            <Label htmlFor="slug">Your public URL</Label>
            <Input id="slug" readOnly value={`${env.appUrl}/${workspace.slug}`} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Change password" />
          <div className="p-5">
            <PasswordForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
