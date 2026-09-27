import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/form/snapshot";
import { buildSteps, estimateMinutes, initialValues, sanitizeValues, validateAll, validateStep } from "@/lib/form/steps";
import type { FormItemRow } from "@/lib/form/types";
import { consentViolations } from "@/lib/consent";

let n = 0;
function item(partial: Partial<FormItemRow>): FormItemRow {
  n += 1;
  return {
    id: `i${n}`,
    section: "question",
    key: `q${n}`,
    label: `Question ${n}`,
    helper_text: null,
    placeholder: null,
    type: "long_text",
    options: [],
    required: false,
    visibility: "public-eligible",
    maps_to_client_field: null,
    default_shown: true,
    default_prefill: "none",
    default_prefill_value: null,
    default_prefill_locked: false,
    sort_order: n,
    archived_at: null,
    ...partial,
  };
}

const items = [
  item({ key: "result", label: "What result did you get on {project_name}?", required: true }),
  item({ key: "old", label: "Archived", archived_at: "2026-01-01" }),
  item({ key: "hidden_q", default_shown: false }),
  item({ section: "about", key: "full_name", type: "text", required: true, maps_to_client_field: "name", default_prefill: "client" }),
  item({ section: "about", key: "company", type: "text", maps_to_client_field: "company", default_prefill: "client", default_prefill_locked: true }),
  item({ section: "about", key: "site", type: "url", maps_to_client_field: "website", default_prefill: "client" }),
  item({ section: "contact", key: "email", type: "email", maps_to_client_field: "email", default_prefill: "client", visibility: "public-eligible" }),
];

const { snapshot, warnings } = buildSnapshot({
  template: { id: "t1", name: "Standard", settings: { rating_enabled: true }, copy: {} },
  items,
  client: { name: "Ada Lovelace", company: "Analytical Ltd", emails: ["ada@example.test"], website: null },
  project: { name: "Engine rebuild" },
  owner: { name: "Owner", photo_url: null, tagline: "", share_url: "" },
});

describe("template snapshot", () => {
  it("drops archived items and keeps section order", () => {
    expect(snapshot.items.map((i) => i.key)).toEqual(["result", "hidden_q", "full_name", "company", "site", "email"]);
  });

  it("prefills from the client record and warns about gaps", () => {
    const byKey = Object.fromEntries(snapshot.items.map((i) => [i.key, i]));
    expect(byKey.full_name.prefill_value).toBe("Ada Lovelace");
    expect(byKey.email.prefill_value).toBe("ada@example.test");
    expect(byKey.company.prefill_locked).toBe(true);
    expect(warnings.some((w) => w.includes("site") || w.includes("Question"))).toBe(true);
  });

  it("forces contact fields to private-only", () => {
    expect(snapshot.items.find((i) => i.key === "email")!.visibility).toBe("private-only");
  });

  it("fills template variables", () => {
    expect(snapshot.context).toMatchObject({ client_first_name: "Ada", project_name: "Engine rebuild", company: "Analytical Ltd" });
  });
});

describe("steps and validation", () => {
  const steps = buildSteps(snapshot);

  it("builds one screen per shown question plus fixed steps", () => {
    expect(steps.map((s) => s.kind)).toEqual(["welcome", "rating", "question", "about", "contact", "consent"]);
    expect(estimateMinutes(snapshot)).toBeGreaterThanOrEqual(1);
  });

  it("blocks required questions and bad formats", () => {
    const v = initialValues(snapshot);
    const q = steps.find((s) => s.kind === "question")!;
    expect(validateStep(q, v, snapshot)).toHaveProperty("result");
    v.about.site = "not a url";
    const about = steps.find((s) => s.kind === "about")!;
    expect(validateStep(about, v, snapshot)).toHaveProperty("site");
  });

  it("requires a consent choice and confirmation", () => {
    const v = initialValues(snapshot);
    v.answers.result = "Great";
    expect(validateAll(v, snapshot)).toHaveProperty("consent_level");
    v.consent_level = "full";
    expect(validateAll(v, snapshot)).toHaveProperty("consent_confirmed");
    v.consent_confirmed = true;
    expect(validateAll(v, snapshot)).toEqual({});
  });

  it("ignores unknown keys and keeps locked values", () => {
    const clean = sanitizeValues(
      {
        answers: { result: "ok", injected: "x" } as Record<string, string>,
        about: { company: "Hacked Inc", full_name: "Ada L." },
        consent_level: "bogus" as never,
        rating: 9,
      },
      snapshot,
    );
    expect(clean.answers).toEqual({ result: "ok" });
    expect(clean.about.company).toBe("Analytical Ltd");
    expect(clean.about.full_name).toBe("Ada L.");
    expect(clean.consent_level).toBeNull();
    expect(clean.rating).toBeNull();
  });
});

describe("consent guard", () => {
  const base = { display_name: "Ada Lovelace", display_role: "CEO", display_company: "Analytical", photo_url: "p", logo_url: null, visibility: "published" as const };

  it("blocks publishing a private testimonial", () => {
    expect(consentViolations("private", base)).toHaveProperty("visibility");
  });
  it("anonymous allows no name, company or photo", () => {
    expect(Object.keys(consentViolations("anonymous", base)).sort()).toEqual(["display_company", "display_name", "photo_url"]);
  });
  it("partial allows first name and one of role/company, no photo", () => {
    expect(Object.keys(consentViolations("partial", base)).sort()).toEqual(["display_company", "display_name", "photo_url"]);
    expect(consentViolations("partial", { ...base, display_name: "Ada", display_company: null, photo_url: null })).toEqual({});
  });
  it("hidden drafts are never blocked", () => {
    expect(consentViolations("private", { ...base, visibility: "hidden" })).toEqual({});
  });
});
