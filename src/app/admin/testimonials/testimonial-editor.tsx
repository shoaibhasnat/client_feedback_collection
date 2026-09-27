"use client";

import { useActionState, useRef, useState } from "react";
import { Alert, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cn } from "@/lib/utils";
import { TagPicker } from "@/components/tags";
import type { Tag } from "@/lib/tags";

/** Which display fields each consent level allows (the database enforces the same rules). */
function allowed(level: string | null | undefined) {
  return {
    name: level !== "anonymous",
    company: level !== "anonymous",
    photo: level === "full" || !level,
    logo: level !== "anonymous",
  };
}
import type { EditorState } from "./actions";

export type EditorValues = {
  display_quote: string | null;
  headline: string | null;
  display_name: string | null;
  display_role: string | null;
  display_company: string | null;
  rating: number | null;
  date: string | null;
  visibility: "published" | "hidden" | "private";
  featured: boolean;
  use_photo?: boolean;
  use_logo?: boolean;
};

export type RawAnswer = { key: string; label: string; value: string };

const RECOMMENDED = { min: 150, max: 350 };

function sentences(text: string): string[] {
  return (text.match(/[^.!?\n]+[.!?]*["”’)]*\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

/**
 * Two-pane review: the client's original answers (read-only, never modified) on the left,
 * the editable showcase testimonial on the right. Clicking a sentence appends it to the quote.
 */
export function ReviewWorkspace({
  answers,
  initial,
  action,
  consentLevel,
  consentHelp,
  photoUrl,
  logoUrl,
  children,
  tags = [],
  selectedTags = [],
}: {
  answers: RawAnswer[];
  initial: EditorValues;
  action: (prev: EditorState, fd: FormData) => Promise<EditorState>;
  consentLevel: string | null;
  consentHelp: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  children?: React.ReactNode;
  tags?: Tag[];
  selectedTags?: string[];
}) {
  const [quote, setQuote] = useState(initial.display_quote ?? "");
  const quoteRef = useRef<HTMLTextAreaElement>(null);

  const insert = (sentence: string) => {
    setQuote((q) => (q.trim() ? `${q.trim()} ${sentence}` : sentence));
    quoteRef.current?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Client's original answers" description="Click a sentence to add it to the display quote. The original is always kept." />
          <div className="space-y-5 p-5">
            {answers.map((a) => (
              <div key={a.key}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{a.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-800">
                  {sentences(a.value).map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => insert(s)}
                      className="mr-1 inline rounded px-0.5 text-left hover:bg-amber-100 focus-visible:bg-amber-100 focus-visible:outline-none"
                      title="Add to display quote"
                    >
                      {s}
                    </button>
                  ))}
                </p>
              </div>
            ))}
            {!answers.length && <p className="text-sm text-slate-500">No written answers.</p>}
          </div>
        </Card>
        {children}
      </div>

      <div>
        <EditorForm
          action={action}
          initial={initial}
          quote={quote}
          setQuote={setQuote}
          quoteRef={quoteRef}
          consentLevel={consentLevel}
          consentHelp={consentHelp}
          photoUrl={photoUrl}
          logoUrl={logoUrl}
          tags={tags}
          selectedTags={selectedTags}
        />
      </div>
    </div>
  );
}

export function EditorForm({
  action,
  initial,
  quote,
  setQuote,
  quoteRef,
  consentLevel,
  consentHelp,
  photoUrl,
  logoUrl,
  extra,
  tags = [],
  selectedTags = [],
}: {
  action: (prev: EditorState, fd: FormData) => Promise<EditorState>;
  initial: EditorValues;
  quote: string;
  setQuote: (q: string) => void;
  quoteRef?: React.RefObject<HTMLTextAreaElement | null>;
  consentLevel?: string | null;
  consentHelp?: string | null;
  photoUrl?: string | null;
  logoUrl?: string | null;
  extra?: React.ReactNode;
  tags?: Tag[];
  selectedTags?: string[];
}) {
  const [state, formAction] = useActionState<EditorState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  const len = quote.trim().length;
  const lenTone = len === 0 ? "text-slate-400" : len < RECOMMENDED.min || len > RECOMMENDED.max ? "text-amber-700" : "text-emerald-700";
  const isPrivate = consentLevel === "private";

  return (
    <form action={formAction} className="space-y-6 lg:sticky lg:top-6">
      <Card>
        <CardHeader
          title="Showcase testimonial"
          description={consentLevel ? `Client consent: ${consentLevel}. ${consentHelp ?? ""}` : undefined}
        />
        <div className="space-y-4 p-5">
          {state.error && <Alert tone="red">{state.error}</Alert>}
          {state.ok && <Alert tone="green">Saved.</Alert>}
          {extra}
          <Field label="Display quote" htmlFor="display_quote" error={fe.display_quote}>
            <Textarea
              ref={quoteRef}
              id="display_quote"
              name="display_quote"
              rows={6}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              maxLength={3000}
              aria-describedby="quote-count"
            />
            <p id="quote-count" className={cn("mt-1 text-xs", lenTone)}>
              {len} characters · aim for {RECOMMENDED.min}–{RECOMMENDED.max}
            </p>
          </Field>
          <Field label="Headline" htmlFor="headline" hint="Optional one-line highlight, e.g. “Launched in 3 weeks”.">
            <Input id="headline" name="headline" defaultValue={initial.headline ?? ""} maxLength={150} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="display_name" error={fe.display_name}>
              <Input
                id="display_name"
                name="display_name"
                defaultValue={allowed(consentLevel).name ? (initial.display_name ?? "") : ""}
                disabled={!allowed(consentLevel).name}
                placeholder={consentLevel === "partial" ? "First name only" : undefined}
                maxLength={150}
              />
            </Field>
            <Field label="Role" htmlFor="display_role" error={fe.display_role}>
              <Input id="display_role" name="display_role" defaultValue={initial.display_role ?? ""} maxLength={150} />
            </Field>
            <Field label="Company" htmlFor="display_company" error={fe.display_company}>
              <Input
                id="display_company"
                name="display_company"
                defaultValue={allowed(consentLevel).company ? (initial.display_company ?? "") : ""}
                disabled={!allowed(consentLevel).company}
                maxLength={150}
              />
            </Field>
            <Field label="Rating" htmlFor="rating">
              <Select id="rating" name="rating" defaultValue={initial.rating ?? ""}>
                <option value="">No rating</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="date">
              <Input id="date" name="date" type="date" defaultValue={initial.date ?? ""} />
            </Field>
            <Field label="Visibility" htmlFor="visibility" error={fe.visibility}>
              <Select id="visibility" name="visibility" defaultValue={initial.visibility}>
                <option value="hidden">Hidden (draft)</option>
                <option value="published" disabled={isPrivate}>
                  Published{isPrivate ? " (not allowed: private)" : ""}
                </option>
                <option value="private">Private</option>
              </Select>
            </Field>
          </div>

          {(photoUrl || logoUrl) && (
            <div className="flex flex-wrap gap-6">
              {photoUrl && (
                <ImageToggle
                  name="use_photo"
                  label={allowed(consentLevel).photo ? "Show photo" : "Photo not allowed by consent"}
                  url={photoUrl}
                  checked={allowed(consentLevel).photo && (initial.use_photo ?? false)}
                  disabled={!allowed(consentLevel).photo}
                  error={fe.photo_url}
                  round
                />
              )}
              {logoUrl && (
                <ImageToggle
                  name="use_logo"
                  label={allowed(consentLevel).logo ? "Show logo" : "Logo not allowed by consent"}
                  url={logoUrl}
                  checked={allowed(consentLevel).logo && (initial.use_logo ?? false)}
                  disabled={!allowed(consentLevel).logo}
                  error={fe.logo_url}
                />
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="featured" defaultChecked={initial.featured} className="size-4" /> Featured
          </label>
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Tags</p>
            <input type="hidden" name="tags_present" value="1" />
            <TagPicker tags={tags} selected={selectedTags} />
          </div>
          <SubmitButton>Save testimonial</SubmitButton>
        </div>
      </Card>
    </form>
  );
}

function ImageToggle({
  name,
  label,
  url,
  checked,
  error,
  round,
  disabled,
}: {
  name: string;
  label: string;
  url: string;
  checked: boolean;
  error?: string;
  round?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} className="size-4" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className={cn("size-12 border border-slate-200 object-cover", round ? "rounded-full" : "rounded-md object-contain")} />
        {label}
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
