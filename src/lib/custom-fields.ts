// Owner-defined extra fields on clients and projects (brief §4.2, §4.3). Values live in the
// entity's `custom_fields` jsonb, so adding a field never needs a migration.

export type CustomFieldType = "text" | "number" | "date" | "dropdown" | "url";

export type CustomFieldDef = {
  id: string;
  entity: "client" | "project";
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
};

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "url", label: "Link (URL)" },
];

export const inputName = (key: string) => `custom__${key}`;

/**
 * Read and validate custom field inputs from a form post. Values for fields that no longer
 * have a definition are kept untouched, so deleting a definition never destroys data.
 */
export function parseCustomFields(
  formData: FormData,
  defs: CustomFieldDef[],
  existing: Record<string, unknown> | null | undefined,
): { values: Record<string, string | number>; errors: Record<string, string> } {
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(existing ?? {})) {
    if (typeof v === "string" || typeof v === "number") values[k] = v;
  }
  const errors: Record<string, string> = {};

  for (const def of defs) {
    const raw = String(formData.get(inputName(def.key)) ?? "").trim();
    if (!raw) {
      delete values[def.key];
      continue;
    }
    switch (def.type) {
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n)) errors[inputName(def.key)] = `${def.label} must be a number.`;
        else values[def.key] = n;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) errors[inputName(def.key)] = `${def.label} must be a date.`;
        else values[def.key] = raw;
        break;
      case "dropdown":
        if (!def.options.includes(raw)) errors[inputName(def.key)] = `Choose one of the options for ${def.label}.`;
        else values[def.key] = raw;
        break;
      case "url":
        if (!/^https?:\/\/\S+\.\S+$/.test(raw) || raw.length > 2000) errors[inputName(def.key)] = `${def.label} must be a link starting with https://`;
        else values[def.key] = raw;
        break;
      default:
        if (raw.length > 500) errors[inputName(def.key)] = `${def.label} is too long (max 500 characters).`;
        else values[def.key] = raw;
    }
  }
  return { values, errors };
}

export function formatCustomValue(def: CustomFieldDef, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (def.type === "date" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  return String(value);
}
