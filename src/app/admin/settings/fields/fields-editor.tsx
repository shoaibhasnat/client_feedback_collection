"use client";

import { useState, useTransition } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { CUSTOM_FIELD_TYPES, type CustomFieldDef, type CustomFieldType } from "@/lib/custom-fields";
import { createCustomFieldAction, deleteCustomFieldAction, updateCustomFieldAction, type FieldResult } from "./actions";

export function CustomFieldsEditor({ defs, readOnly }: { defs: CustomFieldDef[]; readOnly: boolean }) {
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<FieldResult>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { tone: "green", text: success } : { tone: "red", text: res.error ?? "Something went wrong." });
    });

  return (
    <div className="space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        {(["client", "project"] as const).map((entity) => (
          <Card key={entity}>
            <CardHeader
              title={entity === "client" ? "Client fields" : "Project fields"}
              description={
                entity === "client"
                  ? "Shown on the client form. Form fields can fill them, and requests can prefill from them."
                  : "Shown on the project form. Requests can prefill from them."
              }
            />
            <ul className="divide-y divide-slate-100">
              {defs
                .filter((d) => d.entity === entity)
                .map((d) => (
                  <FieldRow key={d.id} def={d} readOnly={readOnly || pending} run={run} />
                ))}
              {!defs.some((d) => d.entity === entity) && <li className="px-5 py-4 text-sm text-slate-500">No custom fields yet.</li>}
            </ul>
            {!readOnly && (
              <div className="border-t border-slate-100 p-5">
                <NewFieldForm entity={entity} pending={pending} run={run} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function FieldRow({ def, readOnly, run }: { def: CustomFieldDef; readOnly: boolean; run: (fn: () => Promise<FieldResult>, s: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(def.label);
  const [options, setOptions] = useState(def.options.join("\n"));
  const typeLabel = CUSTOM_FIELD_TYPES.find((t) => t.value === def.type)?.label ?? def.type;

  if (editing) {
    return (
      <li className="space-y-3 px-5 py-4">
        <Field label="Label" htmlFor={`cf-${def.id}-label`}>
          <Input id={`cf-${def.id}-label`} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        {def.type === "dropdown" && (
          <Field label="Options" htmlFor={`cf-${def.id}-options`} hint="One per line.">
            <Textarea id={`cf-${def.id}-options`} rows={3} value={options} onChange={(e) => setOptions(e.target.value)} />
          </Field>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              run(() => updateCustomFieldAction(def.id, { label, options: options.split("\n").map((s) => s.trim()).filter(Boolean) }), "Field updated.");
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
      <div>
        <p className="font-medium text-slate-900">{def.label}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Badge>{typeLabel}</Badge>
          <code>{def.key}</code>
          {def.type === "dropdown" && <span>{def.options.join(" · ")}</span>}
        </p>
      </div>
      {!readOnly && (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm(`Delete “${def.label}”? Values already saved on records are kept but no longer shown.`)) {
                run(() => deleteCustomFieldAction(def.id), "Field deleted.");
              }
            }}
          >
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}

function NewFieldForm({ entity, pending, run }: { entity: "client" | "project"; pending: boolean; run: (fn: () => Promise<FieldResult>, s: string) => void }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState("");
  const id = (s: string) => `new-${entity}-${s}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="New field label" htmlFor={id("label")}>
        <Input id={id("label")} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={entity === "client" ? "e.g. Team size" : "e.g. Tech stack"} />
      </Field>
      <Field label="Type" htmlFor={id("type")}>
        <Select id={id("type")} value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
          {CUSTOM_FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      {type === "dropdown" && (
        <Field label="Options" htmlFor={id("options")} hint="One per line." className="sm:col-span-2">
          <Textarea id={id("options")} rows={3} value={options} onChange={(e) => setOptions(e.target.value)} />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Button
          size="sm"
          disabled={pending || !label.trim()}
          onClick={() => {
            run(
              () => createCustomFieldAction({ entity, label, type, options: options.split("\n").map((s) => s.trim()).filter(Boolean) }),
              "Field added.",
            );
            setLabel("");
            setOptions("");
          }}
        >
          Add field
        </Button>
      </div>
    </div>
  );
}
