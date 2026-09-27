import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <>
      <PageHeader title="Site & Settings" description="Appearance and branding controls arrive with the public page." />
      <SettingsTabs />
      {children}
    </>
  );
}
