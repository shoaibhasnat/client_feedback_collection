"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import type { EditorState } from "./actions";
import { EditorForm, type EditorValues } from "./testimonial-editor";

export function ManualTestimonialForm({
  action,
  initial,
  clients,
  meta,
  proofUrl,
}: {
  action: (prev: EditorState, fd: FormData) => Promise<EditorState>;
  initial: EditorValues;
  clients: { id: string; name: string }[];
  meta: { client_id: string | null; source: string; proof_link: string | null };
  proofUrl: string | null;
}) {
  const [quote, setQuote] = useState(initial.display_quote ?? "");
  return (
    <div className="max-w-2xl">
      <EditorForm
        action={action}
        initial={initial}
        quote={quote}
        setQuote={setQuote}
        extra={
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" htmlFor="source">
              <Select id="source" name="source" defaultValue={meta.source}>
                <option value="upwork_review">Upwork review</option>
                <option value="manual">Other / manual</option>
              </Select>
            </Field>
            <Field label="Client (optional)" htmlFor="client_id">
              <Select id="client_id" name="client_id" defaultValue={meta.client_id ?? ""}>
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Link to the original review" htmlFor="proof_link" className="sm:col-span-2">
              <Input id="proof_link" name="proof_link" type="url" placeholder="https://www.upwork.com/…" defaultValue={meta.proof_link ?? ""} />
            </Field>
            <Field label="Screenshot as proof" htmlFor="proof" hint="Optional. Replaces the link as proof if both are given." className="sm:col-span-2">
              <div className="flex items-center gap-3">
                {proofUrl && (
                  <a href={proofUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                    Current proof
                  </a>
                )}
                <Input id="proof" name="proof" type="file" accept="image/*" className="h-auto py-1.5" />
              </div>
            </Field>
          </div>
        }
      />
    </div>
  );
}
