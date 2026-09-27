import { Field, Input, Select } from "@/components/ui";
import { inputName, type CustomFieldDef } from "@/lib/custom-fields";

/** Inputs for owner-defined custom fields; values post as `custom__<key>`. */
export function CustomFieldInputs({
  defs,
  values,
  errors = {},
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  errors?: Record<string, string>;
}) {
  return (
    <>
      {defs.map((def) => {
        const name = inputName(def.key);
        const value = values[def.key];
        const str = value === null || value === undefined ? "" : String(value);
        return (
          <Field key={def.id} label={def.label} htmlFor={name} error={errors[name]}>
            {def.type === "dropdown" ? (
              <Select id={name} name={name} defaultValue={str}>
                <option value="">—</option>
                {def.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            ) : (
              <Input
                id={name}
                name={name}
                defaultValue={str}
                type={def.type === "number" ? "number" : def.type === "date" ? "date" : def.type === "url" ? "url" : "text"}
                step={def.type === "number" ? "any" : undefined}
                placeholder={def.type === "url" ? "https://" : undefined}
                maxLength={def.type === "text" ? 500 : undefined}
              />
            )}
          </Field>
        );
      })}
    </>
  );
}
