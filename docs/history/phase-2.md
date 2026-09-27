# Phase 2 — Configure

| | |
| --- | --- |
| **Status** | ✅ Complete — all acceptance criteria met and verified |
| **Completed** | 28 Sep 2026 |
| **Commits** | `ce9cb84` engine & DB rules · `52b859b` form builder · `16b6062` per-request customization · `7e58a36` client form preferences · `2afa545` settings, custom fields, tags · `e854405` consent editor, bulk actions, DB tests · `48b34e6` polish |
| **Brief sections** | §9 Phase 2, §3.2, §3.3, §3.5, §3.7, §4.2 (custom fields, tags), §4.5 (tags, bulk actions, manual testimonials), §4.6, §4.7 |
| **Builds on** | [Phase 1 — Collect](phase-1.md) · [App guide](../architecture.md) |

---

## 1. Goal

Let each owner shape the form without code — for every client and every request — and make the
consent and "never overwrite the client's words" guarantees hold in the database, not just the UI.

**Scope from the brief:** form builder (questions, About You fields, Contact fields), per-client and
per-request form settings (§3.7), multiple templates, template snapshots, custom client and project
fields, consent enforcement, manual testimonials, tags.

---

## 2. Acceptance criteria

| # | Criterion (brief §9) | Status | How it is met | Verified by |
| --- | --- | --- | --- | --- |
| 1 | Owner can add, edit, reorder and archive questions and fields; new requests use the change | ✅ | `/admin/forms/[id]` builder: add/edit panel, drag-and-drop (mouse and keyboard), archive/restore; items resolve into each new request's snapshot | Browser: added a single-choice question, reordered by keyboard, renamed one, archived one → the next request's screen list showed exactly the new set |
| 2 | Editing a template does not alter any existing submission or in-flight request | ✅ | Requests store a self-contained snapshot; a DB trigger makes `template_snapshot` immutable; owners can't write submission content (column grants) | Browser + DB check (old request kept its 6 original questions); `phase2.test.ts` "request snapshots are frozen", "submissions are the client's words" |
| 3 | Publishing is blocked beyond the client's consent level | ✅ | `enforce_testimonial_rules` trigger (consent read from the submission, never from the owner) + editor greys out disallowed fields + readable error | Browser: Partial consent blocked "Jordan Blake" + role + company, allowed "Jordan" + role; `phase2.test.ts` consent suite (7 tests) |
| 4 | Owner can add an Upwork review manually with a screenshot as proof | ✅ | `/admin/testimonials/new`: source "Upwork review", review link and/or screenshot (re-encoded, workspace-private), tags | Browser: saved + published; proof stored as WebP under `{workspace}/testimonials/proof/` |
| 5 | For a given request, owner can hide, require, make optional, prefill and lock any item; the client form reflects it exactly, and the preview matches | ✅ | "Customize form" grid on `/admin/requests/new`; preview renders the **same `FormFlow` component with the same snapshot** the request stores | Browser: hid Q2 and Country, required Q5 and rating, locked Company, prefilled+locked Preferred contact = WhatsApp → preview, stored snapshot and the live client link all matched; server kept the locked value when the browser posted a different one |

---

## 3. What was built

### 3.1 Per-item settings engine (`src/lib/form/`)

- **`settings.ts`** — the four §3.7 settings (visibility, requirement, prefill source+field/value, prefill mode) as `ItemSettings`. `resolveSettings` applies **request override → client default → template default**; hidden items are never required; `none` prefill can't be locked. Rating and consent are pseudo-items (`__rating`, `__consent`). Also: `applyPreset`, `diffSettings` (store only what changed), and `cleanOverride*` to sanitise untrusted input.
- **`snapshot.ts`** (snapshot v2) — resolves every item, reads prefills from any client/project property including custom fields (`custom:<key>`), drops invalid prefilled choices so a lock can't trap the client, warns on empty prefills, and freezes `rating_required` and `consent_forced`.
- **`steps.ts`** — required rating blocks *Next*; a hidden consent step means the answer is fixed to **Private** and the stored consent text says so (brief §3.7: "can be prefilled only with Private").
- **`catalog.ts`** — type labels, section/type rules, and which item types may write into which client property.

Phase 1 (v1) snapshots still render unchanged.

### 3.2 Form builder (`/admin/forms`)

| Feature | Details |
| --- | --- |
| Templates | List with counts; create (starts with the default's About You/Contact fields), duplicate, rename, make default, archive/restore (default can't be archived) |
| Items | Three tabs — Questions, About you, Contact. Add/edit panel: label (with `{client_first_name}`, `{project_name}`, `{company}`), type, options, helper text, placeholder, required, shown by default, visibility (About), "updates client property" mapping (incl. custom client fields), default prefill (source, property/value, locked). Keys are generated once and never change (answers are keyed by them). |
| Reorder | dnd-kit sortable with pointer and keyboard sensors; optimistic, then persisted |
| Archive | Hidden from new requests; kept for old snapshots and submissions; restorable |
| Steps & settings | Rating on/off + required, consent options offered, thank-you button (none / share my link / link) |
| Wording | Every client-facing string: welcome, step titles, buttons, consent descriptions, privacy note, thank-you |
| Live preview | The real client form in preview mode (mobile / desktop, restart), refreshed after every save |
| Guards | Server-side Zod validation; type ↔ mapping compatibility (e.g. only URL fields fill Website, only images fill Photo); image fields must fill photo or logo; prefilled choices must be valid options |

### 3.3 Per-request and per-client settings (§3.7)

- **"Customize form" step** on new requests: a grid of every question, field, rating and consent with the four settings, pre-set from template → client defaults. Changed rows are highlighted; *Reset* returns to the baseline. Quick presets. "Save as this client's defaults". Live screen list, time estimate, missing-prefill warnings, and the preview rendered from the exact snapshot the request will store. Only the differences from the baseline are saved to `requests.item_overrides`.
- **Client "Form preferences"** (`/admin/clients/[id]/form-preferences`): the same grid per template, saved to `clients.form_defaults` relative to the template's defaults; reset to template defaults. Preferences are keyed by item key, so they carry across templates that share items.
- **Presets** (`Site & Settings → Messages & presets`): editable; each sets rating (keep/show/hide), how many questions to show, and which sections to hide. Seeded: *Full form*, *Quick (rating + 2 questions)*, *Details already known (hide About You)*.

### 3.4 Custom fields (`Site & Settings → Custom fields`)

Owner-defined client and project fields (text, number, date, dropdown, URL) stored in `custom_fields`
jsonb — no migrations. Shown and validated on the client/project forms and detail pages. Custom client
fields can be filled by form fields and used as prefill sources; custom project fields as prefill sources.
Key and type are fixed after creation; deleting a definition keeps stored values; a definition still filled
by an active form field can't be deleted.

### 3.5 Tags

- **Management** (`Site & Settings → Tags`): create with type (service, industry, platform, result, other) and colour; edit; **merge** (moves all testimonial and client assignments, then deletes the source); delete.
- **Clients**: tag picker on the client form; chips on the detail page; client list filter by tag.
- **Testimonials**: tag picker in the review editor and manual form; chips in the list; filter by tag and visibility.
- **Bulk actions** on the testimonials list: publish, hide, mark private, add tag, remove tag, delete. Publishing runs row by row so consent-blocked rows are reported ("Published 2. 1 skipped: …") instead of failing the batch.

### 3.6 Consent and data-integrity rules in the database

Migration `20260928000001_phase2_configure.sql`:

| Rule | Mechanism |
| --- | --- |
| Owners can't write submission content (answers, about, contact, consent, rating) or insert submissions | `revoke insert, update` + column grant on `merge_status`, `merge_resolved_at`, `submitted_at` only |
| A testimonial's consent always comes from its submission | `enforce_testimonial_rules` sets `consent_level` from the submission on every write |
| No publishing beyond consent (Private / Anonymous / Partial rules) | Same trigger, via `consent_violation()` |
| Consent withdrawal unpublishes | `sync_testimonial_consent` trigger on `submissions.consent_level` |
| Photo / logo must be this workspace's files; proof = workspace file or http(s) link | `enforce_testimonial_rules` |
| Request snapshots are immutable | `freeze_request_snapshot` trigger |

The editor mirrors these rules (disabled fields, first-name hint, photo/logo toggles) and translates
database errors into plain messages. The merge action now only runs on submitted forms, re-validates every
value against its item type, writes only permitted properties (plus custom client fields), and only accepts
image paths inside the workspace.

### 3.7 Other changes

- `Site & Settings` split into tabs: Profile & account · Messages & presets · Custom fields · Tags.
- Client form: submit disabled until hydrated — an early tap previously triggered a native GET submit that put form fields in the URL.
- Images prefilled from an earlier submission (merged into the client) now preview correctly on the form.
- Preview renders without nested `<form>`/`<main>`; dnd-kit uses stable ids (no hydration mismatch).

---

## 4. Out of scope for Phase 2 (deferred)

| Item | Phase |
| --- | --- |
| Public wall, appearance/theme editor, filtered links, collections, single-testimonial pages, SEO | 3 |
| Video step, embeddable widget, image cards, client approval flow for edited quotes, reminders automation, CSV import/export, custom CSS | 4 |
| Per-request video settings | 4 (with video) |
| Two-factor authentication | Deferred (decision 27 Sep 2026) |

---

## 5. Decisions

| Decision | Reason |
| --- | --- |
| Store request overrides and client defaults as **diffs** | Keeps intent clear ("what the owner changed") and lets template edits flow into clients who haven't overridden an item |
| Client defaults keyed by item key, not template | Brief says "for that client"; shared keys across templates (e.g. `email`) behave consistently |
| Consent enforced by trigger reading the submission | The owner is the party consent protects against; UI-only checks can be bypassed with the owner's own API session |
| Item keys immutable | Answers are stored by key; renaming a key would orphan past answers |
| Custom field key/type immutable | Stored values depend on them |
| Preview uses the real `FormFlow` in a `preview` mode | Guarantees "the preview matches" by construction rather than by a parallel renderer |
| Builder preview uses a sample client | Avoids exposing or depending on a real client's data while editing a template |

---

## 6. Verification

### Automated — 150 tests, all passing

```bash
npm run typecheck && npm run lint
npx vitest run            # 150 tests (needs local Supabase + .env.local)
npx next build            # production build succeeds
```

| File | Tests | Covers |
| --- | --- | --- |
| `tests/form-settings.test.ts` | 14 | precedence (template → client → request), hidden-but-prefilled, custom/project/custom-field prefills, invalid choice prefills dropped, gap warnings, locked values enforced, required rating, hidden rating, forced-private consent, presets, diffs, malformed input |
| `tests/phase2.test.ts` | 16 | owner can't rewrite/insert submissions (bookkeeping still allowed); private/anonymous/partial/full consent rules; consent can't be restated; withdrawal unpublishes; manual testimonials unrestricted; media paths; snapshot immutability and template-edit independence; per-workspace custom-field and tag uniqueness |
| Phase 1 suites | 120 | isolation (98), form engine (12), security (10) — unchanged and passing |

### Manual — browser walkthrough (28 Sep 2026)

1. Builder: added "Which service did we work on, {client_first_name}?" (single choice), reordered by keyboard, preview updated.
2. New request for Jordan: hid Q2 and Country, required Q5 and rating, locked Company, prefilled+locked Preferred contact → changed rows highlighted, screen list and preview updated (rating required, no Skip, blocked without a rating).
3. Created the request → stored `item_overrides` held only the six changes; the snapshot matched the preview.
4. Opened the client link → rating required, Q2 absent, Q5 required, Company read-only, Preferred contact locked to WhatsApp, Country absent; submitted with Partial consent → DB kept the locked Company, stored the hidden Country prefill, no answer for the hidden question.
5. Client Form preferences: hid WhatsApp and rating, saved → next new request started from those settings with zero "changed" rows.
6. Custom fields "Team size" (client, number) and "Tech stack" (project, dropdown) → set Team size = 12 on Jordan, shown on the detail page.
7. Tags: created four, tagged Jordan, merged "shopify stores" into "Shopify" → one assignment remained.
8. Review of the Partial-consent submission: editor pre-limited to "Jordan", no company, photo disabled; publishing "Jordan Blake" + role + company was blocked with field messages; "Jordan" + role published with a tag.
9. Bulk: tagged all, hid all, published all → "Published 2. 1 skipped: no display quote".
10. Builder: renamed and archived questions → the next request showed the new set; the earlier request kept its original six questions.
11. Manual Upwork review with a generated screenshot → published, tagged, proof stored as WebP.

### Issues found and fixed during Phase 2

| Issue | Fix |
| --- | --- |
| Early tap on the client form (before hydration) submitted natively via GET, putting the honeypot field in the URL | Submit button disabled until hydrated (`useSyncExternalStore`) |
| Preview nested inside the request `<form>` (invalid HTML, hydration error) | Preview column moved outside the form; `FormFlow` renders a `div` instead of `<main>` in preview |
| dnd-kit `aria-describedby` ids differed between server and client | Stable `useId()` passed to `DndContext` |
| Screen summary showed raw `{client_first_name}` | Placeholders rendered |
| Client photo merged from an earlier submission didn't preview on the form | Exact snapshot-frozen image prefills may be signed |
| Two "Apply" buttons on the testimonials list | Filter button renamed "Filter" |

---

## 7. Known limitations

- Rating 1–10 / multiple-choice questions can't be prefilled (their values aren't single strings).
- The builder preview refreshes after each save, not on every keystroke.
- Presets change visibility only (not prefills or locks).
- Client form preferences apply by item key; a template that reuses a key with a different meaning inherits the preference.

---

## 8. Handover to Phase 3 (Showcase)

Ready for Phase 3:

- Published testimonials are consent-safe at the database level, so public views can select `visibility = 'published'` without re-implementing consent rules.
- Tags (with types) and `collections` / `collection_items` tables exist for filtered links and collections.
- `site_settings.theme` already holds a light/dark palette used by the client form; the appearance editor can extend it.
- Media paths are guaranteed to be workspace files — public media can be signed or copied to a public bucket per testimonial.

**Security note for Phase 3:** all workspaces share one origin. The planned custom CSS and custom `<head>`
snippet (brief §6) must be sandboxed (e.g. scoped CSS only, no raw HTML/JS on the shared origin) so one
tenant can't run script in another tenant's — or the super admin's — session.
