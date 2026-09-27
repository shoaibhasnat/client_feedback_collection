"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, GripVertical, Pencil, RotateCcw } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { FormPreview } from "@/components/form-preview";
import type { PreviewData } from "@/lib/form-preview";
import { CLIENT_FIELD_LABELS, COPY_FIELDS, PROJECT_FIELD_LABELS, TYPE_LABELS, mappingAllows, typesFor } from "@/lib/form/catalog";
import { NO_PREFILL_TYPES } from "@/lib/form/settings";
import type { ConsentLevel, FormItemRow, ItemSection, ItemType, TemplateCopy, TemplateSettings } from "@/lib/form/types";
import { CHOICE_TYPES, CONSENT_LEVELS } from "@/lib/form/types";
import { cn } from "@/lib/utils";
import {
  archiveItemAction,
  archiveTemplateAction,
  duplicateTemplateAction,
  renameTemplateAction,
  reorderItemsAction,
  saveItemAction,
  saveTemplateCopyAction,
  saveTemplateSettingsAction,
  setDefaultTemplateAction,
  setItemFlagAction,
  type ActionResult,
  type ItemInput,
} from "../actions";

type CustomField = { key: string; label: string };
type Tab = ItemSection | "settings" | "copy";

const TABS: { key: Tab; label: string }[] = [
  { key: "question", label: "Questions" },
  { key: "about", label: "About you" },
  { key: "contact", label: "Contact" },
  { key: "settings", label: "Steps & settings" },
  { key: "copy", label: "Wording" },
];

const SECTION_HELP: Record<ItemSection, string> = {
  question: "Guided questions, one per screen. Placeholders: {client_first_name}, {project_name}, {company}.",
  about: "Profile fields. Answers can be merged into the client record; public-eligible ones may appear on your testimonials.",
  contact: "Always private and never shown publicly.",
};

export function FormBuilder({
  template,
  items,
  clientCustomFields,
  projectCustomFields,
  preview,
  readOnly,
  error,
}: {
  template: { id: string; name: string; is_default: boolean; archived: boolean; settings: Partial<TemplateSettings>; copy: TemplateCopy };
  items: FormItemRow[];
  clientCustomFields: CustomField[];
  projectCustomFields: CustomField[];
  preview: PreviewData;
  readOnly: boolean;
  error: string | null;
}) {
  const [tab, setTab] = useState<Tab>("question");
  const [editing, setEditing] = useState<ItemInput | null>(null);
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(error ? { tone: "red", text: error } : null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>, success?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setMessage({ tone: "red", text: res.error });
      else if (success) setMessage({ tone: "green", text: success });
      else setMessage(null);
    });

  const newItem = (section: ItemSection): ItemInput => ({
    id: null,
    section,
    label: "",
    helper_text: "",
    placeholder: "",
    type: section === "question" ? "long_text" : "text",
    options: [],
    required: false,
    visibility: section === "contact" ? "private-only" : "public-eligible",
    maps_to_client_field: "",
    default_shown: true,
    default_prefill: "none",
    default_prefill_field: "",
    default_prefill_value: "",
    default_prefill_locked: false,
  });

  const editItem = (row: FormItemRow): ItemInput => ({
    id: row.id,
    section: row.section,
    label: row.label,
    helper_text: row.helper_text ?? "",
    placeholder: row.placeholder ?? "",
    type: row.type,
    options: row.options ?? [],
    required: row.required,
    visibility: row.visibility,
    maps_to_client_field: row.maps_to_client_field ?? "",
    default_shown: row.default_shown,
    default_prefill: row.default_prefill,
    default_prefill_field: row.default_prefill_field ?? "",
    default_prefill_value: row.default_prefill_value ?? "",
    default_prefill_locked: row.default_prefill_locked,
  });

  return (
    <div>
      <Header template={template} readOnly={readOnly} onResult={(r) => r.ok ? setMessage({ tone: "green", text: "Renamed." }) : setMessage({ tone: "red", text: r.error })} />

      {message && (
        <Alert tone={message.tone} className="mb-4">
          {message.text}
        </Alert>
      )}
      {readOnly && (
        <Alert tone="amber" className="mb-4">
          This workspace is suspended, so templates are read-only.
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          <div role="tablist" aria-label="Template sections" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={tab === t.key}
                onClick={() => {
                  setTab(t.key);
                  setEditing(null);
                }}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                  tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {t.label}
                {(t.key === "question" || t.key === "about" || t.key === "contact") && (
                  <span className="ml-1.5 text-xs text-slate-400">
                    {items.filter((i) => i.section === t.key && !i.archived_at).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {(tab === "question" || tab === "about" || tab === "contact") && (
            <SectionEditor
              key={tab}
              section={tab}
              templateId={template.id}
              items={items.filter((i) => i.section === tab)}
              editing={editing?.section === tab ? editing : null}
              onEdit={(row) => setEditing(row ? editItem(row) : newItem(tab))}
              onCloseEditor={() => setEditing(null)}
              onSaved={(text) => {
                setEditing(null);
                setMessage({ tone: "green", text });
              }}
              onError={(text) => setMessage({ tone: "red", text })}
              run={run}
              pending={pending}
              readOnly={readOnly}
              clientCustomFields={clientCustomFields}
              projectCustomFields={projectCustomFields}
            />
          )}

          {tab === "settings" && <SettingsEditor template={template} run={run} pending={pending} readOnly={readOnly} />}
          {tab === "copy" && <CopyEditor template={template} run={run} pending={pending} readOnly={readOnly} />}
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <FormPreview
            {...preview}
            title="Live preview"
            note="Sample client “Alex Sample”. Updates each time you save."
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Header ---------------------------------------------------------

function Header({
  template,
  readOnly,
  onResult,
}: {
  template: { id: string; name: string; is_default: boolean; archived: boolean };
  readOnly: boolean;
  onResult: (r: ActionResult) => void;
}) {
  const [name, setName] = useState(template.name);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mb-6">
      <Link href="/admin/forms" className="mb-2 inline-block text-sm text-slate-500 hover:text-slate-900">
        ← Forms
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => onResult(await renameTemplateAction(template.id, name)));
          }}
        >
          <label htmlFor="template-name" className="sr-only">
            Template name
          </label>
          <input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
            maxLength={80}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight text-slate-900 hover:border-slate-200 focus:border-blue-600 focus:outline-none"
          />
          {name !== template.name && (
            <Button size="sm" disabled={pending}>
              Save name
            </Button>
          )}
          {template.is_default && <Badge tone="green">Default</Badge>}
          {template.archived && <Badge tone="amber">Archived</Badge>}
        </form>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {!template.is_default && !template.archived && (
              <form action={setDefaultTemplateAction.bind(null, template.id)}>
                <Button variant="outline" size="sm">
                  Make default
                </Button>
              </form>
            )}
            <form action={duplicateTemplateAction.bind(null, template.id)}>
              <Button variant="outline" size="sm">
                Duplicate
              </Button>
            </form>
            <form action={archiveTemplateAction.bind(null, template.id, !template.archived)}>
              <Button variant="outline" size="sm">
                {template.archived ? "Restore" : "Archive"}
              </Button>
            </form>
          </div>
        )}
      </div>
      <p className="mt-1 px-2 text-sm text-slate-500">
        Changes apply to requests you create from now on. Links already sent keep the form they were sent with.
      </p>
    </div>
  );
}

// ---------- Item lists -----------------------------------------------------

function SectionEditor({
  section,
  templateId,
  items,
  editing,
  onEdit,
  onCloseEditor,
  onSaved,
  onError,
  run,
  pending,
  readOnly,
  clientCustomFields,
  projectCustomFields,
}: {
  section: ItemSection;
  templateId: string;
  items: FormItemRow[];
  editing: ItemInput | null;
  onEdit: (row: FormItemRow | null) => void;
  onCloseEditor: () => void;
  onSaved: (text: string) => void;
  onError: (text: string) => void;
  run: (fn: () => Promise<ActionResult>, success?: string) => void;
  pending: boolean;
  readOnly: boolean;
  clientCustomFields: CustomField[];
  projectCustomFields: CustomField[];
}) {
  const active = items.filter((i) => !i.archived_at).sort((a, b) => a.sort_order - b.sort_order);
  const archived = items.filter((i) => i.archived_at);
  // Local order for optimistic drag-and-drop; re-synced whenever the server list changes.
  const activeKey = active.map((i) => i.id).join(",");
  const [order, setOrder] = useState(active.map((i) => i.id));
  const [syncedKey, setSyncedKey] = useState(activeKey);
  if (syncedKey !== activeKey) {
    setSyncedKey(activeKey);
    setOrder(active.map((i) => i.id));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(active.map((i) => [i.id, i]));
  // Stable id so dnd-kit's accessibility ids match between server and client render.
  const dndId = useId();

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(order, order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
    setOrder(next);
    run(() => reorderItemsAction(templateId, next), "Order saved.");
  };

  const noun = section === "question" ? "question" : "field";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{SECTION_HELP[section]}</p>
        {!readOnly && !editing?.id && (
          <Button size="sm" onClick={() => onEdit(null)} disabled={Boolean(editing)}>
            Add {noun}
          </Button>
        )}
      </div>

      {editing && !editing.id && (
        <ItemEditor
          key="new"
          templateId={templateId}
          initial={editing}
          onCancel={onCloseEditor}
          onSaved={() => onSaved(`${noun === "question" ? "Question" : "Field"} added.`)}
          onError={onError}
          clientCustomFields={clientCustomFields}
          projectCustomFields={projectCustomFields}
        />
      )}

      {order.length === 0 && !editing ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
          No active {noun}s. {section === "question" ? "Add one to guide your client." : ""}
        </p>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2" aria-label={`${noun}s`}>
              {order.map((id, index) => {
                const row = byId.get(id);
                if (!row) return null;
                return editing?.id === id ? (
                  <li key={id}>
                    <ItemEditor
                      templateId={templateId}
                      initial={editing}
                      onCancel={onCloseEditor}
                      onSaved={() => onSaved("Saved.")}
                      onError={onError}
                      clientCustomFields={clientCustomFields}
                      projectCustomFields={projectCustomFields}
                    />
                  </li>
                ) : (
                  <SortableRow
                    key={id}
                    row={row}
                    index={index}
                    readOnly={readOnly || pending}
                    clientCustomFields={clientCustomFields}
                    onEdit={() => onEdit(row)}
                    onFlag={(flag, value) => run(() => setItemFlagAction(templateId, row.id, flag, value))}
                    onArchive={() => run(() => archiveItemAction(templateId, row.id, true), "Archived. Old submissions still show it.")}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {archived.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-600">Archived ({archived.length})</summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {archived.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-slate-500">{row.label}</span>
                {!readOnly && (
                  <Button variant="ghost" size="sm" onClick={() => run(() => archiveItemAction(templateId, row.id, false), "Restored.")}>
                    <RotateCcw className="size-4" aria-hidden /> Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function mappingLabel(field: string | null, custom: CustomField[]) {
  if (!field) return null;
  if (field.startsWith("custom:")) return custom.find((c) => `custom:${c.key}` === field)?.label ?? field;
  return CLIENT_FIELD_LABELS[field] ?? field;
}

function SortableRow({
  row,
  index,
  readOnly,
  clientCustomFields,
  onEdit,
  onFlag,
  onArchive,
}: {
  row: FormItemRow;
  index: number;
  readOnly: boolean;
  clientCustomFields: CustomField[];
  onEdit: () => void;
  onFlag: (flag: "required" | "default_shown", value: boolean) => void;
  onArchive: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: readOnly });
  const mapped = mappingLabel(row.maps_to_client_field, clientCustomFields);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3", isDragging && "relative z-10 shadow-lg")}
    >
      <button
        type="button"
        className="mt-0.5 cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-default"
        aria-label={`Reorder “${row.label}” (use arrow keys after pressing space)`}
        disabled={readOnly}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          <span className="mr-1.5 text-slate-400">{index + 1}.</span>
          {row.label}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Badge>{TYPE_LABELS[row.type]}</Badge>
          {mapped && <Badge tone="blue">fills {mapped}</Badge>}
          {row.default_prefill !== "none" && <Badge tone="purple">prefill: {row.default_prefill}{row.default_prefill_locked ? " (locked)" : ""}</Badge>}
          {row.visibility === "private-only" && row.section !== "contact" && <Badge tone="amber">private</Badge>}
          <code className="text-[11px] text-slate-400">{row.key}</code>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5 text-slate-600">
          <input type="checkbox" checked={row.required} disabled={readOnly} onChange={(e) => onFlag("required", e.target.checked)} className="size-4" />
          Required
        </label>
        <label className="flex items-center gap-1.5 text-slate-600">
          <input type="checkbox" checked={row.default_shown} disabled={readOnly} onChange={(e) => onFlag("default_shown", e.target.checked)} className="size-4" />
          Shown by default
        </label>
        {!readOnly && (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit “${row.label}”`}>
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" onClick={onArchive} aria-label={`Archive “${row.label}”`}>
              <Archive className="size-4" aria-hidden />
            </Button>
          </>
        )}
        </div>
      </div>
    </li>
  );
}

// ---------- Item editor ----------------------------------------------------

function ItemEditor({
  templateId,
  initial,
  onCancel,
  onSaved,
  onError,
  clientCustomFields,
  projectCustomFields,
}: {
  templateId: string;
  initial: ItemInput;
  onCancel: () => void;
  onSaved: () => void;
  onError: (text: string) => void;
  clientCustomFields: CustomField[];
  projectCustomFields: CustomField[];
}) {
  const [v, setV] = useState<ItemInput>(initial);
  const [optionsText, setOptionsText] = useState(initial.options.join("\n"));
  const [fieldError, setFieldError] = useState<{ field?: string; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ItemInput>(k: K, value: ItemInput[K]) => setV((s) => ({ ...s, [k]: value }));

  const isField = v.section !== "question";
  const isChoice = CHOICE_TYPES.includes(v.type);
  const canPrefill = !NO_PREFILL_TYPES.includes(v.type);
  const clientFieldChoices = [
    ...Object.entries(CLIENT_FIELD_LABELS).map(([key, label]) => ({ value: key, label })),
    ...clientCustomFields.map((c) => ({ value: `custom:${c.key}`, label: `${c.label} (custom)` })),
  ];
  const projectFieldChoices = [
    ...Object.entries(PROJECT_FIELD_LABELS).map(([key, label]) => ({ value: key, label })),
    ...projectCustomFields.map((c) => ({ value: `custom:${c.key}`, label: `${c.label} (custom)` })),
  ];
  const mappingChoices = clientFieldChoices.filter((c) => mappingAllows(c.value, v.type));
  const err = (f: string) => (fieldError?.field === f ? fieldError.text : undefined);

  const save = () => {
    const payload: ItemInput = { ...v, options: optionsText.split("\n").map((s) => s.trim()).filter(Boolean) };
    startTransition(async () => {
      const res = await saveItemAction(templateId, payload);
      if (res.ok) onSaved();
      else {
        setFieldError({ field: res.field, text: res.error });
        onError(res.error);
      }
    });
  };

  const id = (s: string) => `item-${initial.id ?? "new"}-${s}`;

  return (
    <Card className="border-blue-300 ring-2 ring-blue-600/10">
      <CardHeader title={initial.id ? "Edit" : v.section === "question" ? "New question" : "New field"} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label={v.section === "question" ? "Question" : "Label"} htmlFor={id("label")} error={err("label")} className="sm:col-span-2">
          <Input id={id("label")} value={v.label} onChange={(e) => set("label", e.target.value)} maxLength={300} autoFocus />
        </Field>
        <Field label="Type" htmlFor={id("type")} error={err("type")}>
          <Select id={id("type")} value={v.type} onChange={(e) => set("type", e.target.value as ItemType)}>
            {typesFor(v.section).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-end gap-4 pb-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.required} onChange={(e) => set("required", e.target.checked)} className="size-4" /> Required
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={v.default_shown} onChange={(e) => set("default_shown", e.target.checked)} className="size-4" /> Shown by default
          </label>
        </div>
        {isChoice && (
          <Field label="Options" htmlFor={id("options")} hint="One per line." error={err("options")} className="sm:col-span-2">
            <Textarea id={id("options")} rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
          </Field>
        )}
        <Field label="Helper text or example answer" htmlFor={id("helper")} hint="Shown under the input." className="sm:col-span-2">
          <Input id={id("helper")} value={v.helper_text} onChange={(e) => set("helper_text", e.target.value)} maxLength={500} />
        </Field>
        <Field label="Placeholder" htmlFor={id("placeholder")}>
          <Input id={id("placeholder")} value={v.placeholder} onChange={(e) => set("placeholder", e.target.value)} maxLength={200} />
        </Field>
        {v.section === "about" && (
          <Field label="Visibility" htmlFor={id("visibility")} hint="Private-only answers never appear on testimonials.">
            <Select id={id("visibility")} value={v.visibility} onChange={(e) => set("visibility", e.target.value as ItemInput["visibility"])}>
              <option value="public-eligible">Public-eligible</option>
              <option value="private-only">Private only</option>
            </Select>
          </Field>
        )}
        {isField && (
          <Field
            label="Updates client property"
            htmlFor={id("maps")}
            hint="When you accept a submission's details, this answer goes here."
            error={err("maps_to_client_field")}
          >
            <Select id={id("maps")} value={v.maps_to_client_field} onChange={(e) => set("maps_to_client_field", e.target.value)}>
              <option value="">— none —</option>
              {mappingChoices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {canPrefill && (
          <fieldset className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium text-slate-700">Default prefill</legend>
            <Field label="Prefill" htmlFor={id("prefill")}>
              <Select
                id={id("prefill")}
                value={v.default_prefill}
                onChange={(e) => {
                  const source = e.target.value as ItemInput["default_prefill"];
                  setV((s) => ({
                    ...s,
                    default_prefill: source,
                    default_prefill_field: source === "client" ? s.maps_to_client_field : "",
                  }));
                }}
              >
                <option value="none">None</option>
                <option value="client">From client record</option>
                <option value="project">From project</option>
                <option value="custom">Custom value</option>
              </Select>
            </Field>
            {(v.default_prefill === "client" || v.default_prefill === "project") && (
              <Field label="Property" htmlFor={id("prefill-field")} error={err("default_prefill_field")}>
                <Select id={id("prefill-field")} value={v.default_prefill_field} onChange={(e) => set("default_prefill_field", e.target.value)}>
                  <option value="">Choose…</option>
                  {(v.default_prefill === "client" ? clientFieldChoices : projectFieldChoices).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {v.default_prefill === "custom" && (
              <Field label="Value" htmlFor={id("prefill-value")} error={err("default_prefill_value")}>
                <Input id={id("prefill-value")} value={v.default_prefill_value} onChange={(e) => set("default_prefill_value", e.target.value)} maxLength={2000} />
              </Field>
            )}
            {v.default_prefill !== "none" && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={v.default_prefill_locked} onChange={(e) => set("default_prefill_locked", e.target.checked)} className="size-4" />
                Locked: the client can confirm the value but not change it
              </label>
            )}
          </fieldset>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------- Settings & wording --------------------------------------------

function SettingsEditor({
  template,
  run,
  pending,
  readOnly,
}: {
  template: { id: string; settings: Partial<TemplateSettings> };
  run: (fn: () => Promise<ActionResult>, success?: string) => void;
  pending: boolean;
  readOnly: boolean;
}) {
  const s = template.settings;
  const [ratingEnabled, setRatingEnabled] = useState(s.rating_enabled ?? true);
  const [ratingRequired, setRatingRequired] = useState(s.rating_required ?? false);
  const [consent, setConsent] = useState<ConsentLevel[]>(s.consent_options ?? [...CONSENT_LEVELS]);
  const [cta, setCta] = useState(s.cta ?? { type: "none" as const, label: "", url: "" });

  return (
    <Card>
      <CardHeader title="Steps & settings" />
      <div className="space-y-6 p-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-900">Star rating step</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ratingEnabled} onChange={(e) => setRatingEnabled(e.target.checked)} className="size-4" disabled={readOnly} />
            Ask for a 1–5 star rating
          </label>
          <label className="flex items-center gap-2 pl-6 text-sm">
            <input
              type="checkbox"
              checked={ratingEnabled && ratingRequired}
              onChange={(e) => setRatingRequired(e.target.checked)}
              disabled={!ratingEnabled || readOnly}
              className="size-4"
            />
            Required
          </label>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-900">Video step</legend>
          <p className="text-sm text-slate-500">Video recording and upload arrive in a later phase.</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-900">Consent options offered</legend>
          <div className="flex flex-wrap gap-4">
            {CONSENT_LEVELS.map((level) => (
              <label key={level} className="flex items-center gap-2 text-sm capitalize">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={readOnly}
                  checked={consent.includes(level)}
                  onChange={(e) => setConsent((c) => (e.target.checked ? [...c, level] : c.filter((x) => x !== level)))}
                />
                {level}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium text-slate-900">Thank-you button</legend>
          <Field label="Type" htmlFor="cta-type">
            <Select id="cta-type" value={cta.type} disabled={readOnly} onChange={(e) => setCta({ ...cta, type: e.target.value as typeof cta.type })}>
              <option value="none">None</option>
              <option value="share">Share my link (copy button)</option>
              <option value="link">Link (e.g. leave an Upwork review)</option>
            </Select>
          </Field>
          {cta.type !== "none" && (
            <Field label="Text" htmlFor="cta-label">
              <Input id="cta-label" value={cta.label} disabled={readOnly} maxLength={200} onChange={(e) => setCta({ ...cta, label: e.target.value })} />
            </Field>
          )}
          {cta.type !== "none" && (
            <Field
              label="Link"
              htmlFor="cta-url"
              hint={cta.type === "share" ? "Leave empty to use the share link from your profile settings." : undefined}
              className="sm:col-span-2"
            >
              <Input id="cta-url" type="url" value={cta.url} disabled={readOnly} placeholder="https://" onChange={(e) => setCta({ ...cta, url: e.target.value })} />
            </Field>
          )}
        </fieldset>

        {!readOnly && (
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  saveTemplateSettingsAction(template.id, {
                    rating_enabled: ratingEnabled,
                    rating_required: ratingRequired,
                    consent_options: consent,
                    cta,
                  }),
                "Settings saved.",
              )
            }
          >
            Save settings
          </Button>
        )}
      </div>
    </Card>
  );
}

function CopyEditor({
  template,
  run,
  pending,
  readOnly,
}: {
  template: { id: string; copy: TemplateCopy };
  run: (fn: () => Promise<ActionResult>, success?: string) => void;
  pending: boolean;
  readOnly: boolean;
}) {
  const [copy, setCopy] = useState<Record<string, string>>({ ...template.copy });
  const groups = [...new Set(COPY_FIELDS.map((f) => f.group))];
  return (
    <Card>
      <CardHeader title="Wording" description="Placeholders: {client_first_name}, {project_name}, {company}." />
      <div className="space-y-6 p-5">
        {groups.map((g) => (
          <fieldset key={g} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-slate-900">{g}</legend>
            {COPY_FIELDS.filter((f) => f.group === g).map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`copy-${f.key}`} className={f.long ? "sm:col-span-2" : undefined}>
                {f.long ? (
                  <Textarea
                    id={`copy-${f.key}`}
                    rows={2}
                    maxLength={1000}
                    disabled={readOnly}
                    value={copy[f.key] ?? ""}
                    onChange={(e) => setCopy((c) => ({ ...c, [f.key]: e.target.value }))}
                  />
                ) : (
                  <Input
                    id={`copy-${f.key}`}
                    maxLength={1000}
                    disabled={readOnly}
                    value={copy[f.key] ?? ""}
                    onChange={(e) => setCopy((c) => ({ ...c, [f.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
          </fieldset>
        ))}
        {!readOnly && (
          <Button disabled={pending} onClick={() => run(() => saveTemplateCopyAction(template.id, copy), "Wording saved.")}>
            Save wording
          </Button>
        )}
      </div>
    </Card>
  );
}
