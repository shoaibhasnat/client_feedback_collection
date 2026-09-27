"use client";

import { useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import { CopyButton } from "@/components/ui/client";
import { cn } from "@/lib/utils";
import { markSentAction } from "../actions";

const TABS = [
  { key: "upwork", label: "Upwork chat" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "reminder", label: "Reminder" },
] as const;

export function ShareBox({
  requestId,
  link,
  messages,
  disabled,
  isDraft,
}: {
  requestId: string;
  link: string;
  messages: Record<(typeof TABS)[number]["key"], string>;
  disabled: boolean;
  isDraft: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("upwork");
  const onCopy = () => {
    if (isDraft && !disabled) void markSentAction(requestId);
  };

  return (
    <Card>
      <CardHeader title="Share the link" description="The app doesn't send emails. Paste the link or message wherever you talk to the client." />
      <div className="space-y-5 p-5">
        <div className={cn("flex flex-wrap items-center gap-2", disabled && "opacity-50")}>
          <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">{link}</code>
          <span onClickCapture={onCopy}>
            <CopyButton text={link} label="Copy link" variant="primary" size="md" />
          </span>
        </div>

        <div>
          <div role="tablist" aria-label="Message templates" className="mb-3 flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="whitespace-pre-wrap text-sm text-slate-800">{messages[tab]}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Edit these templates in Site &amp; Settings.</p>
              <span onClickCapture={tab === "reminder" ? undefined : onCopy}>
                <CopyButton text={messages[tab]} label="Copy message" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
