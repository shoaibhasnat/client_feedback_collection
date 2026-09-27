"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { tagColorClass, type Tag } from "@/lib/tags";
import { cn } from "@/lib/utils";

export function TagChip({ tag, className }: { tag: Pick<Tag, "name" | "color">; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tagColorClass(tag.color), className)}>
      {tag.name}
    </span>
  );
}

/** Toggleable tag chips that post `tags` values with the surrounding form. */
export function TagPicker({
  tags,
  selected,
  name = "tags",
  disabled,
  onChange,
}: {
  tags: Tag[];
  selected: string[];
  name?: string;
  disabled?: boolean;
  onChange?: (ids: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>(selected);
  const toggle = (id: string) => {
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    setValue(next);
    onChange?.(next);
  };
  if (!tags.length) return <p className="text-sm text-slate-500">No tags yet. Create them in Site &amp; Settings → Tags.</p>;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
      {value.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {tags.map((t) => {
        const on = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(t.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-opacity",
              tagColorClass(t.color),
              on ? "opacity-100" : "opacity-50 hover:opacity-80",
            )}
          >
            {on && <Check className="size-3" aria-hidden />}
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
