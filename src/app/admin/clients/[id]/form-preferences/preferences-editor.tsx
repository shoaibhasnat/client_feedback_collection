"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Select } from "@/components/ui";
import { ItemSettingsGrid, type GridRow } from "@/components/item-settings-grid";
import type { ItemSettings } from "@/lib/form/types";
import { saveClientFormDefaultsAction } from "./actions";

export function PreferencesEditor({
  clientId,
  templates,
  templateId,
  rows,
  templateBaseline,
  current,
  prefillValues,
  choices,
  readOnly,
}: {
  clientId: string;
  templates: { id: string; name: string; is_default: boolean }[];
  templateId: string;
  rows: GridRow[];
  templateBaseline: Record<string, ItemSettings>;
  current: Record<string, ItemSettings>;
  prefillValues: Record<string, string | null>;
  choices: { clientCustom: { key: string; label: string }[]; projectCustom: { key: string; label: string }[] };
  readOnly: boolean;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(current);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(settings) !== JSON.stringify(current);

  const save = (next: Record<string, ItemSettings>, text: string) =>
    startTransition(async () => {
      const res = await saveClientFormDefaultsAction(clientId, templateId, next);
      setMessage(res.ok ? { tone: "green", text } : { tone: "red", text: res.error ?? "Could not save." });
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field label="Template" htmlFor="pref-template" className="w-72">
          <Select
            id="pref-template"
            value={templateId}
            onChange={(e) => router.push(`/admin/clients/${clientId}/form-preferences?template=${e.target.value}`)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.is_default ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <p className="max-w-md text-xs text-slate-500">
          Preferences are stored per question/field key, so they also apply to other templates that use the same items.
          Highlighted rows differ from the template.
        </p>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <ItemSettingsGrid
        rows={rows}
        settings={settings}
        baseline={templateBaseline}
        prefillValues={prefillValues}
        choices={choices}
        hasProject
        disabled={readOnly}
        onChange={(key, next) => setSettings((s) => ({ ...s, [key]: next }))}
      />

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending || !dirty} onClick={() => save(settings, "Preferences saved.")}>
            {pending ? "Saving…" : "Save preferences"}
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setSettings(templateBaseline);
              save(templateBaseline, "Reset to the template's defaults.");
            }}
          >
            Reset to template defaults
          </Button>
        </div>
      )}
    </div>
  );
}
