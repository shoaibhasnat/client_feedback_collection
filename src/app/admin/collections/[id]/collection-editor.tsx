"use client";

import { useId, useState, useTransition } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { CopyButton } from "@/components/ui/client";
import { setCollectionItemsAction, updateCollectionAction, type CollectionResult } from "../actions";

export type PickRow = { id: string; quote: string; name: string; company: string | null; visibility: string; rating: number | null };

export function CollectionEditor({
  collection,
  publicUrl,
  selectedIds,
  rows,
  readOnly,
}: {
  collection: { id: string; name: string; slug: string; intro_text: string | null };
  publicUrl: string;
  selectedIds: string[];
  rows: PickRow[];
  readOnly: boolean;
}) {
  const [meta, setMeta] = useState({ name: collection.name, slug: collection.slug, intro_text: collection.intro_text ?? "" });
  const [selected, setSelected] = useState(selectedIds);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dndId = useId();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const run = (fn: () => Promise<CollectionResult>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { tone: "green", text: success } : { tone: "red", text: res.error ?? "Something went wrong." });
    });
  const saveItems = (next: string[]) => {
    setSelected(next);
    run(() => setCollectionItemsAction(collection.id, next), "Collection updated.");
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    saveItems(arrayMove(selected, selected.indexOf(String(e.active.id)), selected.indexOf(String(e.over.id))));
  };
  const url = `${publicUrl}${collection.slug}`;
  const hidden = selected.filter((id) => byId.get(id)?.visibility !== "published").length;

  return (
    <div className="space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Card>
        <CardHeader title="Link" description="Share this in proposals. Only published testimonials appear on it." />
        <div className="flex flex-wrap items-center gap-2 p-5">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-100 px-3 py-2 text-sm">{url}</code>
          <CopyButton text={url} label="Copy link" />
          <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-700 underline">
            Open
          </a>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <div className="space-y-4 p-5">
            <Field label="Name" htmlFor="col-name">
              <Input id="col-name" value={meta.name} maxLength={80} disabled={readOnly} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
            </Field>
            <Field label="Address" htmlFor="col-slug" hint={`${publicUrl}${meta.slug || "…"}`}>
              <Input id="col-slug" value={meta.slug} maxLength={60} disabled={readOnly} onChange={(e) => setMeta({ ...meta, slug: e.target.value.toLowerCase() })} />
            </Field>
            <Field label="Intro text" htmlFor="col-intro" hint="Shown above the testimonials.">
              <Textarea id="col-intro" rows={4} value={meta.intro_text} maxLength={2000} disabled={readOnly} onChange={(e) => setMeta({ ...meta, intro_text: e.target.value })} />
            </Field>
            {!readOnly && (
              <Button disabled={pending} onClick={() => run(() => updateCollectionAction(collection.id, meta), "Details saved.")}>
                Save details
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={`In this collection (${selected.length})`}
            description={hidden ? `${hidden} not published yet, so hidden from the public link.` : "Drag to reorder."}
          />
          {selected.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Add testimonials from the list below.</p>
          ) : (
            <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={selected} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-slate-100" aria-label="Collection order">
                  {selected.map((id) => {
                    const r = byId.get(id);
                    return r ? (
                      <SelectedRow key={id} row={r} readOnly={readOnly || pending} onRemove={() => saveItems(selected.filter((x) => x !== id))} />
                    ) : null;
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Add testimonials" />
        <ul className="divide-y divide-slate-100">
          {rows
            .filter((r) => !selected.includes(r.id))
            .map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-slate-800">{r.quote || <em className="text-slate-400">No display quote yet</em>}</p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    {r.name}
                    {r.company && ` · ${r.company}`}
                    <Badge tone={r.visibility === "published" ? "green" : "slate"}>{r.visibility}</Badge>
                  </p>
                </div>
                {!readOnly && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => saveItems([...selected, r.id])}>
                    Add
                  </Button>
                )}
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

function SelectedRow({ row, readOnly, onRemove }: { row: PickRow; readOnly: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.id, disabled: readOnly });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-start gap-3 bg-white px-4 py-3 text-sm">
      <button type="button" aria-label={`Reorder testimonial from ${row.name}`} className="mt-0.5 cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100" disabled={readOnly} {...attributes} {...listeners}>
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-slate-800">{row.quote || <em className="text-slate-400">No display quote yet</em>}</p>
        <p className="mt-1 text-xs text-slate-500">
          {row.name}
          {row.visibility !== "published" && <span className="ml-2 text-amber-700">not published</span>}
        </p>
      </div>
      {!readOnly && (
        <button type="button" onClick={onRemove} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove testimonial from ${row.name}`}>
          <X className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
