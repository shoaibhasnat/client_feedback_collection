import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Replace {placeholders} in owner-authored text. Unknown keys are left untouched. */
export function fillTemplate(text: string, vars: Record<string, string | null | undefined>): string {
  return text.replace(/\{([a-z_]+)\}/g, (match, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? match : v;
  });
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Empty strings from forms become null so optional columns stay clean. */
export function nullIfEmpty(value: FormDataEntryValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** PostgREST may return a to-one embed as an object or a one-element array; normalize it. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Validate a caller-supplied redirect target. Only same-site paths are allowed:
 * one leading slash followed by a non-slash, non-backslash character, and no
 * control characters. Rejects `//host`, `/\host` (which browsers resolve to an
 * absolute URL) and scheme-relative values, closing off open-redirect abuse.
 */
export function safeRelativePath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  // One leading slash, then a character that is neither slash nor backslash.
  if (!/^\/[^/\\]/.test(value)) return null;
  // Reject ASCII control characters (incl. tab/newline tricks used to smuggle a host).
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return null;
  }
  return value;
}

/**
 * An href for a stored, user-supplied URL, or undefined. Only http(s) and mailto are allowed, so a
 * value written straight through the API (bypassing form validation) can never become a script URL.
 */
export function safeHref(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(v) ? v : undefined;
}
