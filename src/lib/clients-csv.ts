import { z } from "zod";
import { parseCustomFields, inputName, type CustomFieldDef } from "@/lib/custom-fields";

// Client CSV export/import (brief §4.2). The same columns are written and read, so an exported
// file can be edited in a spreadsheet and imported into another workspace.

export const CLIENT_CSV_COLUMNS = [
  "name",
  "company",
  "job_title",
  "emails",
  "phone",
  "whatsapp",
  "linkedin_url",
  "website",
  "country",
  "city",
  "timezone",
  "preferred_contact",
  "source",
  "status",
  "upwork_url",
  "first_project_date",
  "last_project_date",
  "follow_up_date",
  "birthday",
  "tags",
] as const;
type Column = (typeof CLIENT_CSV_COLUMNS)[number];

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Undo the export's formula guard ('=…, '+…) and trim. */
const clean = (v: string | undefined) => {
  const s = (v ?? "").trim();
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
};
const nullable = (v: string) => (v ? v : null);
const list = (v: string) =>
  v
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

const url = z
  .string()
  .max(2000)
  .refine((v) => /^https?:\/\/\S+\.\S+/.test(v), "must be a full link starting with https://")
  .nullable();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-09-27")
  .refine((v) => !Number.isNaN(Date.parse(v)), "isn't a real date")
  .nullable();

const rowSchema = z.object({
  name: z.string().min(1, "is required").max(200),
  company: z.string().max(200).nullable(),
  job_title: z.string().max(200).nullable(),
  emails: z.array(z.email("has an invalid email")).max(10, "has more than 10 emails"),
  phone: z.string().max(40).nullable(),
  whatsapp: z.string().max(40).nullable(),
  linkedin_url: url,
  website: url,
  country: z.string().max(100).nullable(),
  city: z.string().max(100).nullable(),
  timezone: z.string().max(100).nullable(),
  preferred_contact: z.string().max(50).nullable(),
  source: z.enum(["upwork", "referral", "direct", "other"], "must be upwork, referral, direct or other"),
  status: z.enum(["active", "past", "prospect", "do_not_contact"], "must be active, past, prospect or do_not_contact"),
  upwork_url: url,
  first_project_date: date,
  last_project_date: date,
  follow_up_date: date,
  birthday: date,
});
export type ImportedClient = z.infer<typeof rowSchema> & { custom_fields: Record<string, string | number>; tags: string[] };

export type ImportRow = { line: number; client?: ImportedClient; errors: string[]; duplicateOf?: string };

type Mapped = { kind: "column"; column: Column } | { kind: "custom"; def: CustomFieldDef } | null;

/** Match a header cell to a known column, a custom field (by key or label), or nothing. */
function mapHeader(header: string[], defs: CustomFieldDef[]): Mapped[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return header.map((h): Mapped => {
    const n = norm(clean(h));
    if ((CLIENT_CSV_COLUMNS as readonly string[]).includes(n)) return { kind: "column", column: n as Column };
    if (n === "email") return { kind: "column", column: "emails" };
    const def = defs.find((d) => norm(d.key) === n || norm(d.label) === n || `custom_${norm(d.key)}` === n);
    return def ? { kind: "custom", def } : null;
  });
}

/**
 * Validate parsed CSV rows (first row = header). Returns one entry per data row with either a
 * clean client or the reasons it can't be imported. Rows whose email already exists are flagged.
 */
export function readClientRows(rows: string[][], defs: CustomFieldDef[], existingEmails: Map<string, string>): { rows: ImportRow[]; unknownColumns: string[]; error?: string } {
  if (!rows.length) return { rows: [], unknownColumns: [], error: "The file is empty." };
  const [header, ...data] = rows;
  const mapping = mapHeader(header, defs);
  if (!mapping.some((m) => m?.kind === "column" && m.column === "name")) {
    return { rows: [], unknownColumns: [], error: "The first row must be a header with at least a “name” column." };
  }
  if (data.length > MAX_IMPORT_ROWS) return { rows: [], unknownColumns: [], error: `Import at most ${MAX_IMPORT_ROWS} clients at a time.` };
  const unknownColumns = header.filter((_, i) => !mapping[i]).map((h) => h.trim()).filter(Boolean);

  const seenInFile = new Map<string, number>();
  const out: ImportRow[] = data.map((cells, idx) => {
    const line = idx + 2;
    const raw: Partial<Record<Column, string>> = {};
    const customForm = new FormData();
    mapping.forEach((m, i) => {
      if (!m) return;
      const v = clean(cells[i]);
      if (m.kind === "column") raw[m.column] = v;
      else customForm.set(inputName(m.def.key), v);
    });

    const candidate = {
      name: raw.name ?? "",
      company: nullable(raw.company ?? ""),
      job_title: nullable(raw.job_title ?? ""),
      emails: list(raw.emails ?? "").map((e) => e.toLowerCase()),
      phone: nullable(raw.phone ?? ""),
      whatsapp: nullable(raw.whatsapp ?? ""),
      linkedin_url: nullable(raw.linkedin_url ?? ""),
      website: nullable(raw.website ?? ""),
      country: nullable(raw.country ?? ""),
      city: nullable(raw.city ?? ""),
      timezone: nullable(raw.timezone ?? ""),
      preferred_contact: nullable(raw.preferred_contact ?? ""),
      source: (raw.source || "direct").toLowerCase(),
      status: (raw.status || "active").toLowerCase().replace(/\s+/g, "_"),
      upwork_url: nullable(raw.upwork_url ?? ""),
      first_project_date: nullable(raw.first_project_date ?? ""),
      last_project_date: nullable(raw.last_project_date ?? ""),
      follow_up_date: nullable(raw.follow_up_date ?? ""),
      birthday: nullable(raw.birthday ?? ""),
    };
    const parsed = rowSchema.safeParse(candidate);
    const mappedDefs = mapping.flatMap((m) => (m?.kind === "custom" ? [m.def] : []));
    const custom = parseCustomFields(customForm, mappedDefs, null);
    const errors = [
      ...(parsed.success ? [] : parsed.error.issues.map((i) => `${String(i.path[0] ?? "row").replace(/_/g, " ")} ${i.message}`)),
      ...Object.values(custom.errors),
    ];
    if (!parsed.success || errors.length) return { line, errors };

    const client: ImportedClient = { ...parsed.data, custom_fields: custom.values, tags: list(raw.tags ?? "").slice(0, 20) };
    let duplicateOf: string | undefined;
    for (const e of client.emails) {
      duplicateOf ??= existingEmails.get(e);
      if (!duplicateOf && seenInFile.has(e)) duplicateOf = `row ${seenInFile.get(e)} of this file`;
    }
    for (const e of client.emails) if (!seenInFile.has(e)) seenInFile.set(e, line);
    return { line, client, errors: [], duplicateOf };
  });
  return { rows: out, unknownColumns };
}

/** Values for one export row, in CLIENT_CSV_COLUMNS order, then custom fields. */
export function clientExportRow(c: Record<string, unknown>, tagNames: string[], defs: CustomFieldDef[]): unknown[] {
  const custom = (c.custom_fields ?? {}) as Record<string, unknown>;
  return [
    ...CLIENT_CSV_COLUMNS.map((col) => {
      if (col === "emails") return ((c.emails as string[] | null) ?? []).join("; ");
      if (col === "tags") return tagNames.join("; ");
      return c[col] ?? "";
    }),
    ...defs.map((d) => custom[d.key] ?? ""),
  ];
}
