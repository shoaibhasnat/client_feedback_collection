"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { TagChip } from "@/components/tags";
import { TAG_COLORS, TAG_TYPES, tagColorClass, type Tag, type TagColor, type TagType } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { createTagAction, deleteTagAction, mergeTagsAction, updateTagAction, type TagResult } from "./actions";

type TagRow = Tag & { testimonials: number; clients: number };

export function TagsEditor({ tags, readOnly }: { tags: TagRow[]; readOnly: boolean }) {
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<TagResult>, success: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { tone: "green", text: success } : { tone: "red", text: res.error ?? "Something went wrong." });
      if (res.ok) after?.();
    });

  const [draft, setDraft] = useState({ name: "", type: "service" as TagType, color: "blue" as TagColor });

  return (
    <div className="space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {!readOnly && (
        <Card>
          <CardHeader title="New tag" description="Use tags to filter testimonials and clients by service, industry, platform or result." />
          <div className="grid gap-3 p-5 sm:grid-cols-[1fr_180px_auto_auto] sm:items-end">
            <Field label="Name" htmlFor="tag-new-name">
              <Input id="tag-new-name" value={draft.name} maxLength={50} placeholder="e.g. Shopify" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Type" htmlFor="tag-new-type">
              <Select id="tag-new-type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TagType })}>
                {TAG_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} idPrefix="tag-new" />
            <Button
              disabled={pending || !draft.name.trim()}
              onClick={() => run(() => createTagAction(draft), `Tag “${draft.name.trim()}” created.`, () => setDraft({ ...draft, name: "" }))}
            >
              Add tag
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title={`Tags (${tags.length})`} />
        <ul className="divide-y divide-slate-100">
          {tags.map((t) => (
            <TagRowItem key={t.id} tag={t} others={tags.filter((o) => o.id !== t.id)} readOnly={readOnly || pending} run={run} />
          ))}
          {!tags.length && <li className="px-5 py-4 text-sm text-slate-500">No tags yet.</li>}
        </ul>
      </Card>
    </div>
  );
}

function ColorPicker({ value, onChange, idPrefix }: { value: TagColor; onChange: (c: TagColor) => void; idPrefix: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-slate-700">Colour</legend>
      <div className="flex gap-1">
        {TAG_COLORS.map((c) => (
          <label key={c} className="cursor-pointer" title={c}>
            <input type="radio" name={`${idPrefix}-color`} value={c} checked={value === c} onChange={() => onChange(c)} className="peer sr-only" />
            <span
              aria-hidden
              className={cn(
                "block size-6 rounded-full border outline-2 outline-offset-2 peer-focus-visible:outline-blue-600",
                tagColorClass(c),
                value === c ? "outline outline-slate-900" : "",
              )}
            />
            <span className="sr-only">{c}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function TagRowItem({
  tag,
  others,
  readOnly,
  run,
}: {
  tag: TagRow;
  others: TagRow[];
  readOnly: boolean;
  run: (fn: () => Promise<TagResult>, success: string, after?: () => void) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "merge">("view");
  const [draft, setDraft] = useState({ name: tag.name, type: (tag.type ?? "other") as TagType, color: (tag.color ?? "slate") as TagColor });
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const typeLabel = TAG_TYPES.find((t) => t.value === tag.type)?.label ?? "Other";

  return (
    <li className="px-5 py-3 text-sm">
      {mode === "view" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <TagChip tag={tag} />
            <span className="text-xs text-slate-500">
              {typeLabel} · {tag.testimonials} testimonials · {tag.clients} clients
            </span>
          </div>
          {!readOnly && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>
                Edit
              </Button>
              {others.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setMode("merge")}>
                  Merge
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Delete “${tag.name}”? It is removed from ${tag.testimonials} testimonials and ${tag.clients} clients.`)) {
                    run(() => deleteTagAction(tag.id), "Tag deleted.");
                  }
                }}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      )}
      {mode === "edit" && (
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto_auto] sm:items-end">
          <Field label="Name" htmlFor={`tag-${tag.id}-name`}>
            <Input id={`tag-${tag.id}-name`} value={draft.name} maxLength={50} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor={`tag-${tag.id}-type`}>
            <Select id={`tag-${tag.id}-type`} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TagType })}>
              {TAG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} idPrefix={`tag-${tag.id}`} />
          <div className="flex gap-1">
            <Button size="sm" onClick={() => run(() => updateTagAction(tag.id, draft), "Tag updated.", () => setMode("view"))}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {mode === "merge" && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={`Merge “${tag.name}” into`} htmlFor={`tag-${tag.id}-merge`} className="w-64">
            <Select id={`tag-${tag.id}-merge`} value={target} onChange={(e) => setTarget(e.target.value)}>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            size="sm"
            onClick={() => {
              const into = others.find((o) => o.id === target)?.name;
              if (window.confirm(`Move everything tagged “${tag.name}” to “${into}” and delete “${tag.name}”?`)) {
                run(() => mergeTagsAction(tag.id, target), `Merged into “${into}”.`, () => setMode("view"));
              }
            }}
          >
            Merge
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("view")}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}
