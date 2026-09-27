import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/form/snapshot";
import { applyPreset, baselineSettings, cleanOverrideMap, diffSettings, resolveSettings, templateDefaults } from "@/lib/form/settings";
import { buildSteps, consentText, FORCED_PRIVATE_CONSENT_TEXT, initialValues, sanitizeValues, validateAll, validateStep } from "@/lib/form/steps";
import type { FormItemRow, OverrideMap } from "@/lib/form/types";

let n = 0;
function row(partial: Partial<FormItemRow>): FormItemRow {
  n += 1;
  return {
    id: `r${n}`,
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
    default_prefill_field: null,
    default_prefill_value: null,
    default_prefill_locked: false,
    sort_order: n,
    archived_at: null,
    ...partial,
  };
}

const rows = [
  row({ key: "before", required: true, sort_order: 1 }),
  row({ key: "result", required: true, sort_order: 2 }),
  row({ key: "recommend", sort_order: 3 }),
  row({ section: "about", key: "full_name", type: "text", required: true, maps_to_client_field: "name", default_prefill: "client" }),
  row({ section: "about", key: "company", type: "text", maps_to_client_field: "company", default_prefill: "client" }),
  row({ section: "about", key: "team_size", type: "text", maps_to_client_field: "custom:team_size", default_prefill: "client" }),
  row({ section: "contact", key: "email", type: "email", maps_to_client_field: "email", default_prefill: "client" }),
  row({ section: "contact", key: "pref", type: "dropdown", options: ["Email", "WhatsApp"] }),
];

const client = {
  name: "Ada Lovelace",
  company: "Analytical Ltd",
  emails: ["ada@example.test"],
  custom_fields: { team_size: 12 },
  form_defaults: { email: { shown: false }, __rating: { required: true } } as OverrideMap,
};
const project = { name: "Engine rebuild", outcomes: "Speed 38 → 92", custom_fields: { stack: "Shopify" } };
const template = { id: "t1", name: "Standard", settings: { rating_enabled: true }, copy: {} };
const owner = { name: "Owner", photo_url: null, tagline: "", share_url: "" };

const build = (overrides?: OverrideMap) => buildSnapshot({ template, items: rows, client, project, owner, overrides });
const byKey = (overrides?: OverrideMap) => Object.fromEntries(build(overrides).snapshot.items.map((i) => [i.key, i]));

describe("settings precedence: request → client → template", () => {
  it("template defaults apply when nothing is overridden", () => {
    expect(templateDefaults(rows[3])).toMatchObject({ shown: true, required: true, prefill_source: "client", prefill_field: "name" });
  });

  it("client defaults override the template", () => {
    const items = byKey();
    expect(items.email.shown).toBe(false);
    expect(build().snapshot.settings.rating_required).toBe(true);
  });

  it("request overrides beat client defaults", () => {
    const items = byKey({ email: { shown: true }, __rating: { required: false } });
    expect(items.email.shown).toBe(true);
    expect(build({ __rating: { required: false } }).snapshot.settings.rating_required).toBe(false);
  });

  it("hidden items are never required but still carry their prefill", () => {
    const items = byKey({ full_name: { shown: false } });
    expect(items.full_name).toMatchObject({ shown: false, required: false, prefill_value: "Ada Lovelace" });
    const values = sanitizeValues({ about: { full_name: "Someone else" } }, build({ full_name: { shown: false } }).snapshot);
    expect(values.about.full_name).toBe("Ada Lovelace");
  });

  it("prefills from client custom fields, project fields and custom values", () => {
    const items = byKey({
      recommend: { prefill_source: "project", prefill_field: "outcomes" },
      company: { prefill_source: "project", prefill_field: "custom:stack" },
      pref: { prefill_source: "custom", prefill_value: "WhatsApp", prefill_locked: true },
    });
    expect(items.team_size.prefill_value).toBe("12");
    expect(items.recommend.prefill_value).toBe("Speed 38 → 92");
    expect(items.company.prefill_value).toBe("Shopify");
    expect(items.pref).toMatchObject({ prefill_value: "WhatsApp", prefill_locked: true });
  });

  it("drops a prefilled choice that isn't a valid option, so a lock can't trap the client", () => {
    const items = byKey({ pref: { prefill_source: "custom", prefill_value: "Carrier pigeon", prefill_locked: true } });
    expect(items.pref).toMatchObject({ prefill_value: null, prefill_locked: false });
  });

  it("warns when a prefill source has no value", () => {
    const { warnings } = build({ recommend: { prefill_source: "project", prefill_field: "description" } });
    expect(warnings.some((w) => w.includes("Question"))).toBe(true);
  });

  it("locked items keep their value even if the client posts something else", () => {
    const snap = build({ company: { prefill_locked: true } }).snapshot;
    expect(sanitizeValues({ about: { company: "Hacked Inc" } }, snap).about.company).toBe("Analytical Ltd");
  });
});

describe("rating and consent steps", () => {
  it("a required rating blocks Next", () => {
    const snap = build().snapshot;
    const ratingStep = buildSteps(snap).find((s) => s.kind === "rating")!;
    expect(validateStep(ratingStep, initialValues(snap), snap)).toHaveProperty("rating");
  });

  it("hiding the rating removes the step and any posted rating", () => {
    const snap = build({ __rating: { shown: false } }).snapshot;
    expect(buildSteps(snap).some((s) => s.kind === "rating")).toBe(false);
    expect(sanitizeValues({ rating: 5 }, snap).rating).toBeNull();
  });

  it("hiding consent forces Private and records why", () => {
    const snap = build({ __consent: { shown: false } }).snapshot;
    expect(snap.settings.consent_forced).toBe("private");
    expect(buildSteps(snap).some((s) => s.kind === "consent")).toBe(false);
    const start = initialValues(snap);
    expect(start.consent_level).toBe("private");
    const values = sanitizeValues({ ...start, consent_level: "full", answers: { before: "a", result: "b" }, rating: 4 }, snap);
    expect(values.consent_level).toBe("private");
    expect(validateAll(values, snap)).toEqual({});
    expect(consentText(snap, "private")).toBe(FORCED_PRIVATE_CONSENT_TEXT);
  });
});

describe("presets and diffs", () => {
  const baseline = baselineSettings(rows, template.settings, cleanOverrideMap(client.form_defaults));

  it("Quick shows the rating plus the first two questions and hides About/Contact", () => {
    const out = applyPreset({ id: "quick", name: "Quick", rating: "shown", questions_limit: 2, sections_hidden: ["about", "contact"] }, rows, baseline);
    expect([out.before.shown, out.result.shown, out.recommend.shown]).toEqual([true, true, false]);
    expect(out.full_name.shown).toBe(false);
    expect(out.full_name.required).toBe(false);
    expect(out.__rating.shown).toBe(true);
  });

  it("stores only what differs from the baseline", () => {
    const changed = resolveSettings(baseline.company, { shown: false });
    expect(diffSettings(baseline.company, changed)).toEqual({ shown: false });
    expect(diffSettings(baseline.company, baseline.company)).toEqual({});
  });

  it("ignores malformed override input", () => {
    expect(cleanOverrideMap({ "bad key!": { shown: false }, company: { shown: "yes", prefill_field: "x; drop" } })).toEqual({});
  });
});
