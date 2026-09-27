import { Card, PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { GlobalSettingsForm } from "./settings-form";

export default async function GlobalSettingsPage() {
  const admin = createAdminClient();
  const { data } = await admin.from("global_settings").select("app_name, invite_expiry_days, announcement").eq("id", 1).single();
  return (
    <>
      <PageHeader title="Global settings" />
      <Card className="max-w-xl p-5">
        <GlobalSettingsForm
          appName={data?.app_name ?? ""}
          inviteExpiryDays={data?.invite_expiry_days ?? 7}
          announcement={data?.announcement ?? ""}
        />
      </Card>
    </>
  );
}
