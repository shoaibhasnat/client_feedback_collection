import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <>
      <PageHeader title="Site & Settings" description="Your profile, public page appearance, messages, fields and tags." />
      <SettingsTabs />
      {children}
    </>
  );
}
