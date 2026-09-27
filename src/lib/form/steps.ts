import { z } from "zod";
import type {
  AnswerValue,
  ConsentLevel,
  FormValues,
  SnapshotItem,
  Step,
  TemplateSnapshot,
} from "@/lib/form/types";
import { CONSENT_LEVELS } from "@/lib/form/types";
import { fillTemplate } from "@/lib/utils";

/** Ordered list of screens the client will see, derived only from the snapshot. */
export function buildSteps(snapshot: TemplateSnapshot): Step[] {
  const shown = snapshot.items.filter((i) => i.shown);
  const questions = shown.filter((i) => i.section === "question");
  const about = shown.filter((i) => i.section === "about");
  const contact = shown.filter((i) => i.section === "contact");

  const steps: Step[] = [{ kind: "welcome" }];
  if (snapshot.settings.rating_enabled) steps.push({ kind: "rating" });
  questions.forEach((item, index) => steps.push({ kind: "question", item, index, total: questions.length }));
  if (about.length) steps.push({ kind: "about", items: about });
  if (contact.length) steps.push({ kind: "contact", items: contact });
  steps.push({ kind: "consent" });
  return steps;
}

/** Rough completion estimate in minutes, from the number and kind of screens. */
export function estimateMinutes(snapshot: TemplateSnapshot): number {
  const seconds = buildSteps(snapshot).reduce((total, step) => {
    switch (step.kind) {
      case "rating":
        return total + 10;
      case "question":
        return total + (step.item.type === "long_text" ? 50 : 20);
      case "about":
        return total + 10 * step.items.length;
      case "contact":
        return total + 8 * step.items.length;
      case "consent":
        return total + 20;
      default:
        return total;
    }
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

export function renderText(snapshot: TemplateSnapshot, text: string | null | undefined): string {
  return fillTemplate(text ?? "", snapshot.context);
}

// ---------- Validation (shared by browser and server) -------------------

const MAX_TEXT = 5000;

function isBlank(v: AnswerValue | undefined): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Zod schema for one item's value, generated from its definition at runtime. */
export function itemSchema(item: SnapshotItem) {
  let base: z.ZodType;
  switch (item.type) {
    case "rating_5":
      base = z.number().int().min(1).max(5);
      break;
    case "rating_10":
      base = z.number().int().min(1).max(10);
      break;
    case "multiple_choice":
      base = z.array(z.enum(item.options.length ? (item.options as [string, ...string[]]) : [""])).max(50);
      break;
    case "single_choice":
    case "dropdown":
      base = item.options.length ? z.enum(item.options as [string, ...string[]]) : z.string().max(200);
      break;
    case "yes_no":
      base = z.enum(["yes", "no"]);
      break;
    case "email":
      base = z.email("Enter a valid email address").max(320);
      break;
    case "url":
      base = z
        .string()
        .max(2000)
        .refine((v) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), "Enter a full link starting with https://");
      break;
    case "phone":
      base = z.string().max(40).regex(/^[+()\d\s.-]{5,}$/, "Enter a valid phone number");
      break;
    case "image":
      base = z.string().max(500);
      break;
    case "short_text":
    case "text":
      base = z.string().max(300);
      break;
    default:
      base = z.string().max(MAX_TEXT);
  }
  return base;
}

export type FieldErrors = Record<string, string>;

export function validateItems(items: SnapshotItem[], values: Record<string, AnswerValue>): FieldErrors {
  const errors: FieldErrors = {};
  for (const item of items) {
    const value = values[item.key];
    if (isBlank(value)) {
      if (item.required) errors[item.key] = "This one is required.";
      continue;
    }
    const normalized = typeof value === "string" ? value.trim() : value;
    const parsed = itemSchema(item).safeParse(normalized);
    if (!parsed.success) errors[item.key] = parsed.error.issues[0]?.message ?? "Invalid value";
  }
  return errors;
}

export function validateStep(step: Step, values: FormValues, snapshot: TemplateSnapshot): FieldErrors {
  switch (step.kind) {
    case "rating":
      if (values.rating !== null && (values.rating < 1 || values.rating > 5)) return { rating: "Pick 1 to 5 stars." };
      return {};
    case "question":
      return validateItems([step.item], values.answers);
    case "about":
      return validateItems(step.items, values.about);
    case "contact":
      return validateItems(step.items, values.contact);
    case "consent": {
      const allowed = snapshot.settings.consent_options.length ? snapshot.settings.consent_options : CONSENT_LEVELS;
      if (!values.consent_level || !allowed.includes(values.consent_level)) {
        return { consent_level: "Choose how your feedback may be used." };
      }
      if (!values.consent_confirmed) return { consent_confirmed: "Please confirm to submit." };
      return {};
    }
    default:
      return {};
  }
}

/** Full validation before final submission. Locked prefills must match the snapshot. */
export function validateAll(values: FormValues, snapshot: TemplateSnapshot): FieldErrors {
  const errors: FieldErrors = {};
  for (const step of buildSteps(snapshot)) Object.assign(errors, validateStep(step, values, snapshot));
  return errors;
}

/** Only keys defined in the snapshot are kept; locked and hidden items take their snapshot value. */
export function sanitizeValues(input: Partial<FormValues>, snapshot: TemplateSnapshot): FormValues {
  const pick = (section: SnapshotItem["section"], source: Record<string, AnswerValue> | undefined) => {
    const out: Record<string, AnswerValue> = {};
    for (const item of snapshot.items.filter((i) => i.section === section)) {
      if (!item.shown || item.prefill_locked) {
        if (item.prefill_value !== null) out[item.key] = item.prefill_value;
        continue;
      }
      const v = source?.[item.key];
      if (v === undefined) continue;
      if (Array.isArray(v)) out[item.key] = v.filter((x) => typeof x === "string").slice(0, 50);
      else if (typeof v === "string") out[item.key] = v.slice(0, MAX_TEXT);
      else if (typeof v === "number" && Number.isFinite(v)) out[item.key] = v;
      else out[item.key] = null;
    }
    return out;
  };

  const rating =
    typeof input.rating === "number" && input.rating >= 1 && input.rating <= 5 ? Math.round(input.rating) : null;
  const consent =
    input.consent_level && CONSENT_LEVELS.includes(input.consent_level as ConsentLevel)
      ? (input.consent_level as ConsentLevel)
      : null;

  return {
    rating,
    answers: pick("question", input.answers),
    about: pick("about", input.about),
    contact: pick("contact", input.contact),
    consent_level: consent,
    consent_confirmed: Boolean(input.consent_confirmed),
  };
}

export function initialValues(snapshot: TemplateSnapshot): FormValues {
  const values: FormValues = {
    rating: null,
    answers: {},
    about: {},
    contact: {},
    consent_level: null,
    consent_confirmed: false,
  };
  for (const item of snapshot.items) {
    if (item.prefill_value === null) continue;
    const bucket = item.section === "question" ? values.answers : values[item.section];
    bucket[item.key] = item.prefill_value;
  }
  return values;
}

export function consentText(snapshot: TemplateSnapshot, level: ConsentLevel): string {
  const description = snapshot.copy[`consent_${level}`] ?? level;
  const confirm = snapshot.copy.consent_confirm ?? "";
  return `${description} ${confirm}`.trim();
}
