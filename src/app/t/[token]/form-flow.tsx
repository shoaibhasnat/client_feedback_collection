"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, Lock, Star } from "lucide-react";
import { buildSteps, renderText, validateStep, type FieldErrors } from "@/lib/form/steps";
import type { AnswerValue, ConsentLevel, FormValues, SnapshotItem, Step, TemplateSnapshot } from "@/lib/form/types";
import type { PublicTheme } from "@/lib/public-form";
import { cn } from "@/lib/utils";
import { fontStack } from "@/lib/site/fonts";
import { finishVideoUpload, removeVideo, saveProgress, startVideoUpload, submitForm, uploadFormImage } from "./actions";
import { VideoStep, type VideoUploadState } from "./video-step";
import { VIDEO_STORAGE_MAX_MB } from "@/lib/video-limits";

/** PUT the file to the signed storage URL with progress events (fetch has no upload progress). */
function putWithProgress(url: string, body: Blob, type: string, onProgress: (pct: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) xhr.setRequestHeader("apikey", anon);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(body);
  });
}

type Props = {
  token: string;
  snapshot: TemplateSnapshot;
  initialValues: FormValues;
  initialStep: number;
  initialImageUrls: Record<string, string>;
  /** Already-uploaded video when resuming (signed URL for playback). */
  initialVideo?: { path: string; url: string | null } | null;
  personalMessage: string | null;
  ownerPhotoUrl: string | null;
  shareUrl: string | null;
  theme: PublicTheme;
  minutes: number;
  /** Dashboard preview: renders exactly what the client sees, but never saves, uploads or submits. */
  preview?: boolean;
};

export function FormFlow(props: Props) {
  const { snapshot, token } = props;
  const steps = useMemo(() => buildSteps(snapshot), [snapshot]);
  const [rawIndex, setStepIndex] = useState(props.initialStep);
  // In preview the snapshot can shrink under us (owner hides items); stay on a valid screen.
  const stepIndex = Math.min(rawIndex, steps.length - 1);
  const [values, setValues] = useState<FormValues>(props.initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [imageUrls, setImageUrls] = useState(props.initialImageUrls);
  const [video, setVideo] = useState<{ path: string | null; url: string | null }>({
    path: props.initialVideo?.path ?? null,
    url: props.initialVideo?.url ?? null,
  });
  const [videoUpload, setVideoUpload] = useState<VideoUploadState>({ status: "idle", progress: 0 });
  const uploadRef = useRef<Promise<boolean> | null>(null);

  // Background upload: start → PUT to storage with progress → server verifies and attaches.
  const uploadVideo = (blob: Blob, type: string, duration: number | null, thumbnail: Blob | null) => {
    const localUrl = URL.createObjectURL(blob);
    const task = (async () => {
      setVideoUpload({ status: "uploading", progress: 0 });
      const start = await startVideoUpload(token, { size: blob.size, type, duration });
      if (!start.ok) {
        setVideoUpload({ status: "error", progress: 0, error: start.error });
        return false;
      }
      const ok = await putWithProgress(start.url, blob, type, (progress) => setVideoUpload({ status: "uploading", progress }));
      if (!ok) {
        setVideoUpload({ status: "error", progress: 0, error: "The upload was interrupted. Check your connection and try again." });
        return false;
      }
      const fd = new FormData();
      if (thumbnail) fd.append("thumbnail", new File([thumbnail], "thumbnail.jpg", { type: "image/jpeg" }));
      const fin = await finishVideoUpload(token, start.path, fd);
      if (!fin.ok) {
        setVideoUpload({ status: "error", progress: 0, error: fin.error });
        return false;
      }
      setVideo({ path: start.path, url: fin.url ?? localUrl });
      setValues((v) => ({ ...v, video_path: start.path }));
      setErrors((e) => {
        const rest = { ...e };
        delete rest.video;
        return rest;
      });
      setVideoUpload({ status: "done", progress: 100 });
      return true;
    })();
    uploadRef.current = task;
  };

  const discardVideo = () => {
    setVideo({ path: null, url: null });
    setValues((v) => ({ ...v, video_path: null }));
    setVideoUpload({ status: "idle", progress: 0 });
    void removeVideo(token);
  };
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "closed">("idle");
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const honeypot = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const step = steps[stepIndex];
  // False during SSR and until hydration: a tap before then would natively submit the <form>.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const copy = (key: string, fallback: string) => renderText(snapshot, snapshot.copy[key] || fallback);

  // Move focus to the new screen's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (props.preview) return;
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [stepIndex, status, props.preview]);

  const update = (section: "answers" | "about" | "contact", key: string, value: AnswerValue) => {
    setValues((v) => ({ ...v, [section]: { ...v[section], [key]: value } }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
  };

  const goTo = (next: number) => {
    setErrors({});
    setBanner(null);
    setStepIndex(Math.max(0, Math.min(steps.length - 1, next)));
  };

  const next = () => {
    const stepErrors = validateStep(step, values, snapshot);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    advance(values);
  };

  // Move forward and autosave in the background, so the client can close the tab and resume.
  const advance = (snapshotValues: FormValues) => {
    const target = stepIndex + 1;
    goTo(target);
    if (step.kind === "welcome" || props.preview) return;
    startTransition(async () => {
      const res = await saveProgress(token, target, snapshotValues);
      if (!res.ok) {
        if (res.closed) setStatus("closed");
        setBanner(res.error);
      }
    });
  };

  const skip = () => {
    let next = values;
    if (step.kind === "question") next = { ...values, answers: { ...values.answers, [step.item.key]: null } };
    if (step.kind === "rating") next = { ...values, rating: null };
    setValues(next);
    advance(next);
  };

  const submit = () => {
    const stepErrors = validateStep(step, values, snapshot);
    if (Object.keys(stepErrors).length) {
      setErrors(stepErrors);
      return;
    }
    if (props.preview) {
      setStatus("done");
      return;
    }
    setStatus("saving");
    startTransition(async () => {
      // A video still uploading in the background must finish before we submit.
      if (uploadRef.current && videoUpload.status === "uploading") {
        const ok = await uploadRef.current;
        if (!ok) {
          setStatus("idle");
          setBanner("Your video didn't finish uploading. Go back to the video step to try again, or remove it.");
          return;
        }
      }
      const res = await submitForm(token, values, honeypot.current?.value ?? "");
      if (res.ok) {
        setStatus("done");
        return;
      }
      setStatus(res.closed ? "closed" : "idle");
      setBanner(res.error);
      if (res.fieldErrors) {
        // Jump back to the first screen with a problem.
        const idx = steps.findIndex((s) => Object.keys(validateStep(s, values, snapshot)).length > 0);
        if (idx >= 0) {
          setStepIndex(idx);
          setErrors(validateStep(steps[idx], values, snapshot));
        }
      }
    });
  };

  const style = {
    "--tc-primary": props.theme.primary,
    "--tc-bg": props.theme.background,
    "--tc-surface": props.theme.surface,
    "--tc-text": props.theme.text,
    "--tc-muted": props.theme.muted,
    "--tc-border": props.theme.border,
    ...(props.theme.fontBody ? { fontFamily: fontStack(props.theme.fontBody) } : {}),
    ...(props.theme.fontHeading ? { "--tc-font-heading": fontStack(props.theme.fontHeading) } : {}),
    ...(props.theme.backgroundImage
      ? { backgroundImage: `url("${props.theme.backgroundImage}")`, backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }
      : {}),
  } as React.CSSProperties;

  // Inside the dashboard preview the page already has a <main>.
  const Main = props.preview ? "div" : "main";
  const progress = Math.round((stepIndex / (steps.length - 1)) * 100);
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className={cn("tc-form flex flex-1 flex-col", props.preview ? "min-h-[640px]" : "min-h-screen")} style={style}>
      {status !== "done" && stepIndex > 0 && (
        <div className="sticky top-0 z-10 bg-[var(--tc-bg)]/95 backdrop-blur">
          <div
            className="h-1.5 w-full bg-[var(--tc-border)]"
            role="progressbar"
            aria-label="Form progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full bg-[var(--tc-primary)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="px-4 pt-2 text-right text-xs text-[var(--tc-muted)]" aria-live="polite">
            Step {stepIndex} of {steps.length - 1}
            {pending && " · saving…"}
            {videoUpload.status === "uploading" && ` · uploading video ${videoUpload.progress}%`}
          </p>
        </div>
      )}

      <Main
        className={cn(
          "mx-auto flex w-full max-w-xl flex-1 flex-col px-5 pb-10 pt-6 sm:pt-12",
          // Keep text readable over an owner-chosen background photo.
          props.theme.backgroundImage && "my-4 rounded-2xl bg-[var(--tc-bg)]/95 shadow-lg sm:my-10",
        )}
      >
        {banner && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {banner}
          </p>
        )}

        {status === "done" ? (
          <ThankYou headingRef={headingRef} snapshot={snapshot} copy={copy} shareUrl={props.shareUrl} />
        ) : status === "closed" ? (
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
            This form is no longer available.
          </h1>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (isLast) submit();
              else next();
            }}
            className="flex flex-1 flex-col"
          >
            {/* Honeypot: hidden from people, tempting for bots. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Leave this empty
                <input ref={honeypot} type="text" name="website_url" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <div className="flex-1">
              <StepView
                step={step}
                snapshot={snapshot}
                values={values}
                errors={errors}
                headingRef={headingRef}
                copy={copy}
                update={update}
                setValues={setValues}
                setErrors={setErrors}
                imageUrls={imageUrls}
                onImageUploaded={(path, url) => setImageUrls((m) => ({ ...m, [path]: url }))}
                token={props.preview ? "" : token}
                personalMessage={props.personalMessage}
                ownerPhotoUrl={props.ownerPhotoUrl}
                minutes={props.minutes}
                preview={props.preview}
                video={video}
                videoUpload={videoUpload}
                onVideo={uploadVideo}
                onRemoveVideo={discardVideo}
              />
            </div>

            <div className="mt-8 flex items-center gap-3">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => goTo(stepIndex - 1)}
                  className="h-12 rounded-xl border border-[var(--tc-border)] px-5 font-medium text-[var(--tc-text)] hover:bg-[var(--tc-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-primary)]"
                >
                  {copy("back_button", "Back")}
                </button>
              )}
              <button
                type="submit"
                disabled={status === "saving" || !hydrated}
                className="h-12 flex-1 rounded-xl bg-[var(--tc-primary)] px-6 font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-primary)] disabled:opacity-60"
              >
                {stepIndex === 0
                  ? copy("start_button", "Let's start")
                  : isLast
                    ? status === "saving"
                      ? "Submitting…"
                      : copy("submit_button", "Submit")
                    : copy("next_button", "Next")}
              </button>
            </div>
            {isSkippable(step, snapshot) && (
              <button
                type="button"
                onClick={skip}
                className="mt-3 self-center text-sm text-[var(--tc-muted)] underline underline-offset-2"
              >
                Skip this one
              </button>
            )}
          </form>
        )}
      </Main>
    </div>
  );
}

function isSkippable(step: Step, snapshot: TemplateSnapshot) {
  if (step.kind === "rating") return !snapshot.settings.rating_required;
  if (step.kind === "video") return !snapshot.settings.video_required;
  return step.kind === "question" && !step.item.required;
}

type StepViewProps = {
  step: Step;
  snapshot: TemplateSnapshot;
  values: FormValues;
  errors: FieldErrors;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  copy: (key: string, fallback: string) => string;
  update: (section: "answers" | "about" | "contact", key: string, value: AnswerValue) => void;
  setValues: React.Dispatch<React.SetStateAction<FormValues>>;
  setErrors: React.Dispatch<React.SetStateAction<FieldErrors>>;
  imageUrls: Record<string, string>;
  onImageUploaded: (path: string, url: string) => void;
  token: string;
  personalMessage: string | null;
  ownerPhotoUrl: string | null;
  minutes: number;
  preview?: boolean;
  video: { path: string | null; url: string | null };
  videoUpload: VideoUploadState;
  onVideo: (blob: Blob, type: string, duration: number | null, thumbnail: Blob | null) => void;
  onRemoveVideo: () => void;
};

const headingClass = "text-2xl font-semibold leading-snug outline-none sm:text-3xl";

function StepView({ headingRef, ...p }: StepViewProps) {
  const { step, snapshot } = p;

  switch (step.kind) {
    case "welcome":
      return (
        <div className="flex flex-col items-center pt-6 text-center">
          {p.ownerPhotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.ownerPhotoUrl} alt={snapshot.owner.name} width={96} height={96} className="mb-5 size-24 rounded-full object-cover" />
          )}
          <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
            {p.copy("welcome_title", "Hi {client_first_name}!")}
          </h1>
          <p className="mt-4 text-lg text-[var(--tc-muted)]">
            {p.copy("welcome_text", "Thanks for working with me on {project_name}.")}
          </p>
          {p.personalMessage && (
            <blockquote className="mt-6 w-full rounded-xl bg-[var(--tc-surface)] p-4 text-left">
              <p className="whitespace-pre-wrap">{p.personalMessage}</p>
              {snapshot.owner.name && <footer className="mt-2 text-sm text-[var(--tc-muted)]">— {snapshot.owner.name}</footer>}
            </blockquote>
          )}
          <p className="mt-6 text-sm text-[var(--tc-muted)]">Takes about {p.minutes} minute{p.minutes === 1 ? "" : "s"}. You can stop and come back later.</p>
        </div>
      );

    case "rating":
      return (
        <fieldset>
          <legend>
            <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
              {p.copy("rating_title", "How would you rate working with me overall?")}
            </h1>
          </legend>
          {!snapshot.settings.rating_required && <p className="mt-2 text-sm text-[var(--tc-muted)]">(optional)</p>}
          <StarInput
            name="rating"
            max={5}
            value={p.values.rating}
            onChange={(n) => p.setValues((v) => ({ ...v, rating: n }))}
          />
          <ErrorText message={p.errors.rating} />
        </fieldset>
      );

    case "question": {
      const item = step.item;
      return (
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--tc-muted)]">
            Question {step.index + 1} of {step.total}
          </p>
          <ItemInput
            item={item}
            value={p.values.answers[item.key] ?? null}
            error={p.errors[item.key]}
            onChange={(v) => p.update("answers", item.key, v)}
            snapshot={snapshot}
            headingRef={headingRef}
            asHeading
          />
        </div>
      );
    }

    case "about":
    case "contact": {
      const section = step.kind;
      return (
        <div>
          <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
            {section === "about" ? p.copy("about_title", "A little about you") : p.copy("contact_title", "How can I reach you?")}
          </h1>
          {section === "contact" ? (
            <p className="mt-2 flex items-start gap-2 text-sm text-[var(--tc-muted)]">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Private. These details are only for me and are never shown publicly.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--tc-muted)]">Check these details. You choose what can be shown publicly on the last step.</p>
          )}
          <div className="mt-6 space-y-5">
            {step.items.map((item) => (
              <ItemInput
                key={item.key}
                item={item}
                value={p.values[section][item.key] ?? null}
                error={p.errors[item.key]}
                onChange={(v) => p.update(section, item.key, v)}
                snapshot={snapshot}
                imageUrls={p.imageUrls}
                onImageUploaded={p.onImageUploaded}
                token={p.token}
              />
            ))}
          </div>
        </div>
      );
    }

    case "video":
      return (
        <VideoStep
          headingRef={headingRef}
          title={p.copy("video_title", "Would you record a short video?")}
          prompts={snapshot.items.filter((i) => i.section === "question" && i.shown).map((i) => renderText(snapshot, i.label))}
          maxSeconds={snapshot.settings.video_max_seconds ?? 90}
          maxMb={Math.min(snapshot.settings.video_max_mb ?? VIDEO_STORAGE_MAX_MB, VIDEO_STORAGE_MAX_MB)}
          required={Boolean(snapshot.settings.video_required)}
          preview={p.preview}
          current={{ url: p.video.url, hasVideo: Boolean(p.video.path) }}
          upload={p.videoUpload}
          onVideo={p.onVideo}
          onRemove={p.onRemoveVideo}
          error={p.errors.video}
        />
      );

    case "consent":
      return <ConsentStep {...p} headingRef={headingRef} />;
  }
}

function ConsentStep({ headingRef, ...p }: StepViewProps) {
  const options = (p.snapshot.settings.consent_options?.length
    ? p.snapshot.settings.consent_options
    : ["full", "partial", "anonymous", "private"]) as ConsentLevel[];
  const titles: Record<ConsentLevel, string> = {
    full: "Full",
    partial: "Partial",
    anonymous: "Anonymous",
    private: "Private",
  };
  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
        {p.copy("consent_title", "How can I use your feedback?")}
      </h1>
      <p className="mt-3 rounded-xl bg-[var(--tc-surface)] p-4 text-sm text-[var(--tc-muted)]">
        {p.copy("privacy_note", "Your contact details are private and never shown publicly.")}
      </p>
      <fieldset className="mt-5">
        <legend className="sr-only">Display level</legend>
        <div className="space-y-3">
          {options.map((level) => {
            const checked = p.values.consent_level === level;
            return (
              <label
                key={level}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                  checked ? "border-[var(--tc-primary)] bg-[var(--tc-surface)]" : "border-[var(--tc-border)]",
                )}
              >
                <input
                  type="radio"
                  name="consent_level"
                  value={level}
                  checked={checked}
                  onChange={() => {
                    p.setValues((v) => ({ ...v, consent_level: level }));
                    p.setErrors({});
                  }}
                  className="mt-1 size-4 accent-[var(--tc-primary)]"
                />
                <span>
                  <span className="block font-semibold">{titles[level]}</span>
                  <span className="block text-sm text-[var(--tc-muted)]">{p.copy(`consent_${level}`, level)}</span>
                </span>
              </label>
            );
          })}
        </div>
        <ErrorText message={p.errors.consent_level} />
      </fieldset>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={p.values.consent_confirmed}
          onChange={(e) => {
            const checked = e.target.checked;
            p.setValues((v) => ({ ...v, consent_confirmed: checked }));
            p.setErrors({});
          }}
          className="mt-0.5 size-4 accent-[var(--tc-primary)]"
        />
        <span>{p.copy("consent_confirm", "I confirm my answers can be used as described above.")}</span>
      </label>
      <ErrorText message={p.errors.consent_confirmed} />
    </div>
  );
}

function ThankYou({
  headingRef,
  snapshot,
  copy,
  shareUrl,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  snapshot: TemplateSnapshot;
  copy: (key: string, fallback: string) => string;
  shareUrl: string | null;
}) {
  const cta = snapshot.settings.cta;
  const [copied, setCopied] = useState(false);
  const target = cta.type === "share" ? cta.url || shareUrl : cta.url;
  return (
    <div className="flex flex-col items-center pt-10 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-[var(--tc-primary)] text-white">
        <Check className="size-7" aria-hidden />
      </div>
      <h1 ref={headingRef} tabIndex={-1} className={headingClass}>
        {copy("thanks_title", "Thank you!")}
      </h1>
      <p className="mt-4 text-lg text-[var(--tc-muted)]">{copy("thanks_text", "I really appreciate you taking the time.")}</p>
      {cta.type !== "none" && target && (
        <div className="mt-8 w-full rounded-xl bg-[var(--tc-surface)] p-5">
          <p className="font-medium">{renderText(snapshot, cta.label)}</p>
          {cta.type === "share" ? (
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(target).catch(() => {});
                setCopied(true);
              }}
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--tc-border)] bg-[var(--tc-bg)] px-4 text-sm font-medium"
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
            </button>
          ) : (
            <a href={target} target="_blank" rel="noreferrer" className="mt-3 inline-block font-medium text-[var(--tc-primary)] underline">
              {target.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Inputs ---------------------------------------------------------

const inputClass =
  "block w-full rounded-xl border border-[var(--tc-border)] bg-[var(--tc-bg)] px-4 py-3 text-base text-[var(--tc-text)] placeholder:text-[var(--tc-muted)]/70 focus:border-[var(--tc-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--tc-primary)]/25 read-only:bg-[var(--tc-surface)]";

function ItemInput({
  item,
  value,
  error,
  onChange,
  snapshot,
  headingRef,
  asHeading,
  imageUrls,
  onImageUploaded,
  token,
}: {
  item: SnapshotItem;
  value: AnswerValue;
  error?: string;
  onChange: (v: AnswerValue) => void;
  snapshot: TemplateSnapshot;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  asHeading?: boolean;
  imageUrls?: Record<string, string>;
  onImageUploaded?: (path: string, url: string) => void;
  token?: string;
}) {
  const id = `f-${item.key}`;
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const label = renderText(snapshot, item.label);
  const locked = item.prefill_locked;
  const describedBy = [item.helper_text ? helpId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  const str = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);

  const labelNode = asHeading ? (
    <h1 ref={headingRef} tabIndex={-1} className={cn(headingClass, "mb-5")}>
      <label htmlFor={id}>{label}</label>
      {!item.required && <span className="ml-2 align-middle text-base font-normal text-[var(--tc-muted)]">(optional)</span>}
    </h1>
  ) : (
    <label htmlFor={id} className="mb-1.5 block font-medium">
      {label}
      {!item.required && <span className="font-normal text-[var(--tc-muted)]"> (optional)</span>}
      {locked && <span className="ml-2 text-xs font-normal text-[var(--tc-muted)]">(confirmed)</span>}
    </label>
  );

  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": item.required || undefined,
  };

  let control: React.ReactNode;
  switch (item.type) {
    case "long_text":
      control = (
        <textarea
          {...common}
          rows={6}
          maxLength={5000}
          className={cn(inputClass, "min-h-40")}
          placeholder={item.placeholder ?? "Type your answer…"}
          value={str}
          readOnly={locked}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "rating_5":
    case "rating_10":
      control = (
        <StarInput
          name={id}
          max={item.type === "rating_5" ? 5 : 10}
          value={typeof value === "number" ? value : null}
          onChange={(n) => onChange(n)}
          labelledBy={id}
        />
      );
      break;
    case "yes_no":
    case "single_choice":
    case "multiple_choice": {
      const options = item.type === "yes_no" ? ["yes", "no"] : item.options;
      const multi = item.type === "multiple_choice";
      const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      control = (
        <div role={multi ? "group" : "radiogroup"} aria-labelledby={id} className="space-y-2">
          {options.map((opt) => (
            <label
              key={opt}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3",
                selected.includes(opt) ? "border-[var(--tc-primary)] bg-[var(--tc-surface)]" : "border-[var(--tc-border)]",
              )}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name={id}
                checked={selected.includes(opt)}
                disabled={locked}
                className="size-4 accent-[var(--tc-primary)]"
                onChange={(e) => {
                  if (multi) onChange(e.target.checked ? [...selected, opt] : selected.filter((s) => s !== opt));
                  else onChange(opt);
                }}
              />
              {item.type === "yes_no" ? (opt === "yes" ? "Yes" : "No") : opt}
            </label>
          ))}
        </div>
      );
      break;
    }
    case "dropdown":
      control = (
        <select {...common} className={inputClass} value={str} disabled={locked} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Choose…</option>
          {item.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
      break;
    case "image":
      control = (
        <ImageUpload
          item={item}
          path={str || null}
          previewUrl={str ? (imageUrls?.[str] ?? null) : null}
          token={token!}
          onUploaded={(path, url) => {
            onImageUploaded?.(path, url);
            onChange(path);
          }}
          onRemove={() => onChange(null)}
          inputId={id}
          describedBy={describedBy}
        />
      );
      break;
    default: {
      const type = item.type === "email" ? "email" : item.type === "phone" ? "tel" : item.type === "url" ? "url" : "text";
      const autoComplete =
        item.maps_to_client_field === "name"
          ? "name"
          : item.type === "email"
            ? "email"
            : item.type === "phone"
              ? "tel"
              : item.maps_to_client_field === "company"
                ? "organization"
                : item.maps_to_client_field === "job_title"
                  ? "organization-title"
                  : undefined;
      control = (
        <input
          {...common}
          type={type}
          inputMode={type === "tel" ? "tel" : type === "email" ? "email" : type === "url" ? "url" : undefined}
          autoComplete={autoComplete}
          maxLength={item.type === "url" ? 2000 : 300}
          className={inputClass}
          placeholder={item.placeholder ?? undefined}
          value={str}
          readOnly={locked}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
  }

  return (
    <div>
      {labelNode}
      {control}
      {item.helper_text && (
        <p id={helpId} className="mt-2 text-sm text-[var(--tc-muted)]">
          {renderText(snapshot, item.helper_text)}
        </p>
      )}
      <ErrorText id={errId} message={error} />
    </div>
  );
}

function StarInput({
  name,
  max,
  value,
  onChange,
  labelledBy,
}: {
  name: string;
  max: number;
  value: number | null;
  onChange: (n: number) => void;
  labelledBy?: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "Rating"} className="mt-6 flex flex-wrap gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <label key={n} className="cursor-pointer rounded-lg p-1 focus-within:outline-2 focus-within:outline-[var(--tc-primary)]">
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
          <span className="sr-only">
            {n} of {max}
          </span>
          {max === 5 ? (
            <Star
              aria-hidden
              className={cn("size-11", value !== null && n <= value ? "fill-amber-400 text-amber-400" : "text-[var(--tc-border)]")}
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                "flex size-10 items-center justify-center rounded-lg border text-sm font-semibold",
                value === n ? "border-[var(--tc-primary)] bg-[var(--tc-primary)] text-white" : "border-[var(--tc-border)]",
              )}
            >
              {n}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}

function ImageUpload({
  item,
  path,
  previewUrl,
  token,
  onUploaded,
  onRemove,
  inputId,
  describedBy,
}: {
  item: SnapshotItem;
  path: string | null;
  previewUrl: string | null;
  token: string;
  onUploaded: (path: string, url: string) => void;
  onRemove: () => void;
  inputId: string;
  describedBy?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const square = item.maps_to_client_field === "photo_url" || item.key === "photo";

  if (item.prefill_locked) {
    return <p className="text-sm text-[var(--tc-muted)]">Already on file.</p>;
  }
  if (!token) {
    return <p className="text-sm text-[var(--tc-muted)]">Image upload (disabled in preview).</p>;
  }

  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex size-20 shrink-0 items-center justify-center overflow-hidden border border-[var(--tc-border)] bg-[var(--tc-surface)]",
          square ? "rounded-full" : "rounded-xl",
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className={cn("size-full", square ? "object-cover" : "object-contain")} />
        ) : path ? (
          <Check className="size-6 text-[var(--tc-muted)]" aria-label="Image on file" />
        ) : null}
      </div>
      <div className="min-w-0">
        <label
          htmlFor={inputId}
          className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-[var(--tc-border)] px-4 text-sm font-medium focus-within:outline-2 focus-within:outline-[var(--tc-primary)] hover:bg-[var(--tc-surface)]"
        >
          {uploading ? "Uploading…" : path ? "Replace image" : "Choose image"}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            aria-describedby={describedBy}
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 8 * 1024 * 1024) {
                setError("Images must be 8 MB or smaller.");
                return;
              }
              setError(null);
              setUploading(true);
              const fd = new FormData();
              fd.append("file", file);
              const res = await uploadFormImage(token, item.key, fd).catch(() => ({ ok: false as const, error: "Upload failed. Try again." }));
              setUploading(false);
              if (res.ok) onUploaded(res.path, res.url);
              else setError(res.error);
            }}
          />
        </label>
        {path && !uploading && (
          <button type="button" onClick={onRemove} className="ml-3 text-sm text-[var(--tc-muted)] underline">
            Remove
          </button>
        )}
        {square && <p className="mt-1 text-xs text-[var(--tc-muted)]">We&apos;ll crop it to a square.</p>}
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ErrorText({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}
