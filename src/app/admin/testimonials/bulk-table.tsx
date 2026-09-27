"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Select } from "@/components/ui";
import { TagChip } from "@/components/tags";
import type { Tag } from "@/lib/tags";
import { formatDate, humanize } from "@/lib/utils";
import { bulkTestimonialAction } from "./actions";

export type ListRow = {
  id: string;
  submission_id: string | null;
  display_quote: string | null;
  name: string;
  source: string;
  visibility: string;
  featured: boolean;
  rating: number | null;
  date: string | null;
  consent_level: string | null;
  tags: Tag[];
};

export function TestimonialsTable({ rows, tags, readOnly }: { rows: ListRow[]; tags: Tag[]; readOnly: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [op, setOp] = useState("publish");
  const [tagId, setTagId] = useState(tags[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "green" | "amber" | "red"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const all = rows.length > 0 && selected.length === rows.length;

  const apply = () => {
    if (op === "delete" && !window.confirm(`Delete ${selected.length} testimonials? Client submissions are kept.`)) return;
    startTransition(async () => {
      const res = await bulkTestimonialAction({ ids: selected, op, tagId: op.startsWith("tag_") ? tagId : null });
      setMessage({ tone: res.ok ? "green" : "amber", text: res.message });
      if (res.ok) setSelected([]);
    });
  };

  return (
    <div className="space-y-3">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="text-slate-600">{selected.length} selected</span>
          <label htmlFor="bulk-op" className="sr-only">
            Bulk action
          </label>
          <Select id="bulk-op" value={op} onChange={(e) => setOp(e.target.value)} className="h-9 w-44">
            <option value="publish">Publish</option>
            <option value="hide">Hide</option>
            <option value="private">Mark private</option>
            <option value="tag_add" disabled={!tags.length}>
              Add tag
            </option>
            <option value="tag_remove" disabled={!tags.length}>
              Remove tag
            </option>
            <option value="delete">Delete</option>
          </Select>
          {op.startsWith("tag_") && (
            <>
              <label htmlFor="bulk-tag" className="sr-only">
                Tag
              </label>
              <Select id="bulk-tag" value={tagId} onChange={(e) => setTagId(e.target.value)} className="h-9 w-44">
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </>
          )}
          <Button size="sm" variant={op === "delete" ? "danger" : "primary"} disabled={!selected.length || pending} onClick={apply}>
            {pending ? "Working…" : "Apply"}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              {!readOnly && (
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="size-4"
                    checked={all}
                    onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                  />
                </th>
              )}
              <th className="px-4 py-2.5 font-medium">Quote</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Source</th>
              <th className="px-4 py-2.5 font-medium">Visibility</th>
              <th className="px-4 py-2.5 font-medium">Consent</th>
              <th className="px-4 py-2.5 font-medium">Rating</th>
              <th className="px-4 py-2.5 font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                {!readOnly && (
                  <td className="px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`Select testimonial from ${t.name}`}
                      checked={selected.includes(t.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id)))}
                    />
                  </td>
                )}
                <td className="max-w-md px-4 py-3 align-top">
                  <Link
                    href={t.submission_id ? `/admin/testimonials/review/${t.submission_id}` : `/admin/testimonials/${t.id}`}
                    className="line-clamp-2 text-slate-900 hover:underline"
                  >
                    {t.display_quote || <em className="text-slate-400">No display quote yet</em>}
                  </Link>
                  {(t.featured || t.tags.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.featured && <Badge tone="amber">Featured</Badge>}
                      {t.tags.map((tag) => (
                        <TagChip key={tag.id} tag={tag} />
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-slate-700">{t.name}</td>
                <td className="px-4 py-3 align-top text-slate-700">{humanize(t.source)}</td>
                <td className="px-4 py-3 align-top">
                  <Badge tone={t.visibility === "published" ? "green" : t.visibility === "private" ? "red" : "slate"}>{t.visibility}</Badge>
                </td>
                <td className="px-4 py-3 align-top text-slate-600">{t.consent_level ?? "—"}</td>
                <td className="px-4 py-3 align-top text-amber-500">{t.rating ? "★".repeat(t.rating) : "—"}</td>
                <td className="px-4 py-3 align-top text-slate-600">{formatDate(t.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
