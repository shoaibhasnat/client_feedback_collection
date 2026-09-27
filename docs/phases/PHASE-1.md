# Phase 1 — Collect (MVP)

| | |
| --- | --- |
| **Status** | ✅ Complete — all acceptance criteria met and verified |
| **Completed** | 27 Sep 2026 |
| **Commit** | `d280f7f` — *Phase 1 (Collect): multi-tenant testimonial collector MVP* |
| **Brief sections** | §9 Phase 1, §10 (multi-tenancy, super admin), plus the parts of §3, §4, §7, §8 it depends on |
| **App reference** | [docs/APP.md](../APP.md) |

---

## 1. Goal

Deliver a deployable, multi-tenant MVP in which a super admin can onboard businesses by invite, and
each business owner can record clients and projects, send a testimonial request link, receive a
completed submission from the client's phone, and turn it into a testimonial — with workspace
isolation enforced by the database from day one.

**Scope from the brief:** workspaces and Row Level Security isolation, super admin seed, basic super
admin panel (create workspace, invite owner, list users), invite acceptance, login, clients and projects
CRUD with notes, one default form template seeded, request links, full client form (without video),
submissions inbox, basic testimonial editing.

---

## 2. Acceptance criteria

| # | Criterion (brief §9) | Status | How it is met | Verified by |
| --- | --- | --- | --- | --- |
| 1 | Owner can add a client and project, fill in all owner-known info, and add notes | ✅ | `/admin/clients/new`, `/admin/projects/new`; full profile per §4.2/§4.3; timestamped notes log | Browser walkthrough |
| 2 | Owner can generate a request link and copy a ready-made message | ✅ | `/admin/requests/new` → request page with Copy link + Upwork / Email / WhatsApp / Reminder messages; copying marks the request *sent* | Browser walkthrough |
| 3 | Client can complete the form on a phone, leave and resume later, and submit | ✅ | `/t/{token}`, mobile-first, autosave after every step, resumes at saved step with answers | Browser at 375 px incl. reload mid-form |
| 4 | Submission appears in the inbox; About You / Contact answers can be merged into the client profile | ✅ | `/admin/testimonials` inbox; review page shows "On file vs Client submitted" with per-field accept | Browser walkthrough + DB check |
| 5 | Owner can write a display quote and mark the testimonial published or private | ✅ | Review page editor; click-a-sentence insertion; visibility published/hidden/private | Browser walkthrough + DB check |
| 6 | Super admin can create a workspace and invite an owner; the owner accepts and lands in an empty, seeded workspace | ✅ | `/superadmin` create form → invite link → `/invite/{token}` → `/admin?welcome=1` with checklist and Standard template | Browser walkthrough |
| 7 | There is no way to sign up without an invite | ✅ | Auth sign-up disabled; no sign-up UI; invites are hashed, single-use, expiring | `isolation.test.ts` → "public sign-up is disabled" |
| 8 | Isolation tests pass: a user in workspace A cannot access any data, file or public page data of workspace B | ✅ | RLS + composite FKs + storage policies (see APP.md §5) | `isolation.test.ts` (98 tests) |

---

## 3. What was built

### 3.1 Database (`supabase/migrations/`)

- **Core migration** — 13 enums; 6 platform tables; 19 workspace-scoped business tables (all tables from brief §7, so later phases need no tenancy retrofit); tenancy helpers; RLS policies generated for every business table; `updated_at` and `workspace_id`-immutability triggers; composite foreign keys; profile auto-creation trigger; column-level grants on `profiles`.
- **Seed/storage migration** — `seed_workspace()` (site settings, message templates, theme preset, Standard template with 5 questions + 7 About You + 4 Contact fields); `superadmin_workspace_stats()` (counts, storage bytes, last activity); private `uploads` bucket with workspace-scoped policies.

### 3.2 Accounts and access

| Feature | Route / file |
| --- | --- |
| Sign in (rate-limited, audited, updates `last_sign_in_at`) | `/login`, `app/login/actions.ts` |
| Password reset via Supabase built-in email | `/forgot-password` → email → `/auth/confirm` → `/reset-password` |
| Invite acceptance (atomic claim, creates user + membership, signs in) | `/invite/[token]` |
| Super admin bootstrap | `npm run seed:admin` (`scripts/seed-superadmin.ts`) |
| Route gating and session refresh | `src/proxy.ts`, `src/lib/auth.ts` |

### 3.3 Super admin panel (`/superadmin`)

| Page | Capabilities |
| --- | --- |
| Workspaces | Create workspace + owner invite (link shown once, copy button); search; owner, status, counts (clients, testimonials, requests, videos), storage used, last activity |
| Workspace detail | Rename / change slug (reserved slugs blocked); suspend / reactivate; generate new invite link; invite history with revoke |
| Users | Name, email, workspace, last sign-in, 2FA on/off, status; disable / enable (auth ban + profile status); force password reset |
| Invites | All invites with effective status (pending / accepted / expired / revoked); revoke |
| Audit log | Latest 300 entries: sign-ins, workspace/invite/user actions, with IP hash |
| Settings | App name, invite expiry days, announcement banner shown in every owner dashboard |

No page shows client names, contact details, notes or testimonial content.

### 3.4 Owner dashboard (`/admin`)

| Area | Capabilities |
| --- | --- |
| **Home** | Counts (testimonials, published, pending review, awaiting response, average rating); new submissions to review; requests with no response after *N* days; quick actions; onboarding checklist (profile, branding, first client, first request); suspended-workspace and announcement banners |
| **Clients** | List with search, filters (source, status, has testimonial), sort (name, last project, follow-up, recent), overdue follow-ups highlighted. Create/edit every §4.2 profile field incl. photo and logo upload, referral link to another client, Upwork URL, dates. Detail page: profile, projects, requests + submissions, testimonials, notes log (add/delete), activity timeline, pending-merge banner. Delete client with all data and files. |
| **Projects** | List with search and status filter. Create/edit every §4.3 field (links as `Label \| URL`, outcomes, private budget and notes). Keeps client first/last project dates in sync. Detail page with requests and attachments (images re-encoded, PDFs validated). Delete. |
| **Requests** | Create: client → project (filtered) → template, personal message, optional expiry, **live preview** of screens, estimated time and missing-prefill warnings. Detail: link, message templates, frozen form snapshot, timeline of every status timestamp, client's current step. Actions: mark reminded, reopen, revoke, duplicate, change expiry, delete (before start). List filters: awaiting response, to review, done, revoked; expired shown. |
| **Testimonials** | Inbox of submissions (new / profile-update badges, rating, first answer). Review page: raw answers left (click a sentence to add it), editor right (quote with 150–350 character guidance, headline, display name/role/company, rating, date, photo/logo toggles, featured, visibility), consent guard, merge panel, private details and exact consent text. "All testimonials" list. Manual testimonial entry (Upwork review / manual, review link or screenshot proof). |
| **Forms** | Read-only view of templates and their items (builder is Phase 2) |
| **Site & Settings** | Owner profile (name, photo, tagline, services, contact links, share link for the thank-you CTA); message templates (must contain `{link}`) and reminder days; public URL (read-only); change password (re-authenticates first) |

### 3.5 Client-facing form (`/t/{token}`)

Rendered entirely from the request's template snapshot.

1. **Welcome** — greeting by first name, project name, owner photo, personal message, estimated time.
2. **Rating** — 1–5 stars, optional, skippable.
3. **Guided questions** — one per screen, "Question n of N", helper text, "(optional)" + *Skip*, required items block *Next*.
4. **About you** — prefilled from the client record; photo (square crop) and logo upload with preview; URL/email/phone validation; locked items read-only.
5. **Contact** — prefilled, clearly labelled private.
6. **Consent** — Full / Partial / Anonymous / Private with descriptions, privacy note, confirmation checkbox.
7. **Thank you** — owner-editable copy and CTA (share link / external link).

Also: progress bar and step counter; back button keeps answers; autosave after every step (including
skips); resume at the saved step; server-side re-validation and sanitisation (unknown keys dropped,
locked/hidden values forced to their snapshot value, image paths restricted to the submission's own
folder); honeypot; rate limits; closed states for invalid, revoked, expired, suspended and
already-submitted links; focus moves to each new screen's heading; the owner's theme colours applied.
"Opened", "started" and "submitted" are logged to the request and the activity timeline.

### 3.6 Additions beyond the Phase 1 list

These were cheap to include and are referenced by Phase 1 screens:

- **Consent guard (basic)** — blocks publishing a Private testimonial, and names/photos/companies beyond Partial or Anonymous consent. Phase 2 completes enforcement.
- **Manual testimonials** with proof (listed under Phase 2 in the brief; linked from the Home quick actions).
- **Project attachments** (brief §4.3).
- **Suspend / reactivate, rename / slug change, disable user, force password reset, audit log, global settings** in the super admin panel.

---

## 4. Out of scope for Phase 1 (deferred)

| Item | Phase |
| --- | --- |
| Form builder (add/edit/reorder/archive questions and fields), multiple templates, per-client and per-request item overrides UI, quick presets | 2 |
| Custom client/project fields UI, tags UI, full consent enforcement | 2 |
| Public wall `/{slug}`, appearance/theme editor, filtered links, collections, single-testimonial pages, SEO, Open Graph | 3 |
| Video recording/upload, embeddable widget, image cards, client approval flow for edited quotes, CSV import/export, custom CSS, full data export | 4 |
| Workspace deletion with 30-day grace period and purge; per-workspace export from the super admin panel | Later (with Phase 4 export) |
| TOTP two-factor (optional for owners, required for super admin) | Deferred by decision on 27 Sep 2026 |

Schema for all of the above already exists, so no tenancy migration is needed later.

---

## 5. Decisions and deviations

| Decision | Reason |
| --- | --- |
| Local Supabase in Docker for development | Chosen at kickoff; migrations push unchanged to Supabase Cloud. |
| Super admin email `admin@example.test` locally | Chosen at kickoff; set `SUPER_ADMIN_EMAIL` for production. |
| Code in `testimonial/app` with its own git repo | Chosen at kickoff; the brief PDF stays in the parent folder. |
| 2FA deferred | Chosen at kickoff; not in the Phase 1 scope list. |
| Hand-written UI primitives instead of shadcn/ui CLI | The dashboard needs only a handful of components; avoids generator churn with Tailwind 4 / React 19. Same look and API style. |
| Zod without React Hook Form | Forms use Server Actions + `useActionState`; the client form uses one shared Zod-based validator for browser and server. |
| `ws` passed as supabase-js realtime transport | The dev machine runs Node 20, which has no native WebSocket. Node 22 makes it unnecessary. |
| `[auth.email] enable_signup` left **on** | In the Supabase CLI that flag disables email login entirely. Public sign-up is blocked by the global `[auth] enable_signup = false`. In Supabase Cloud: turn off "Allow new users to sign up" but keep the Email provider enabled. |
| In-memory rate limiting | Adequate for the brief's scale (4–5 workspaces, one instance). |
| Request status stays `draft` until the link or a message is copied | Gives the owner a true "sent" timestamp without the app sending anything. |

---

## 6. Verification

### Automated — 110 tests, all passing

```bash
npm run typecheck
npm run lint
npm run test:unit         # 12 tests, no database needed
npm run test:isolation    # 98 tests, needs local Supabase + .env.local
```

**`tests/form.test.ts` (12):** snapshot drops archived items and keeps section order; prefill from the
client record with gap warnings; contact fields forced private; template variables; step construction and
time estimate; required and format validation; consent required and confirmed; sanitising drops unknown
keys and keeps locked values; consent guard for private, anonymous, partial, and hidden drafts.

**`tests/isolation.test.ts` (98):** creates workspaces A and B, each with a row in **every** business
table and a stored file, then as owner A:

- For each of the 19 tables: lists only A's rows; cannot read, update or delete B's row by id.
- Cannot insert into B, move its own row into B, or link a row to B's client (composite FKs).
- Rows default to A's workspace; tag names are unique per workspace, not globally.
- Sees only its own workspace, membership and profile; no invites or audit log; cannot become super admin; cannot call privileged functions.
- Storage: can read own file; cannot download, sign, list, upload into or delete in B's folder; bucket not publicly readable.
- Anonymous: no table access; sign-up rejected; a request token resolves to exactly its own workspace; malformed/unknown tokens reveal nothing.
- Suspension: owner keeps read access, loses write access, request link reports unavailable. Disabled owner loses data access even with a live session.

### Manual — end-to-end walkthrough in the browser (27 Sep 2026)

1. Super admin signed in → created workspace **Acme Studio** (slug auto-filled) → invite link shown once.
2. Invite opened → owner set name and password → landed on `/admin?welcome=1` with checklist, zero counts, Standard template present.
3. Client added with profile, Upwork source and first note → detail page showed note and "Client created" activity.
4. Project added with dates, budget, links and outcomes.
5. Request created → preview showed 11 screens / ~6 min and three missing-prefill warnings → *Copy link* moved status draft → sent.
6. Form at 375 px: welcome with personal message; 5-star rating; required-question validation; skip; answers kept on *Back*; **page reload resumed at Question 4**; About You prefilled; photo uploaded (stored as ~3 KB WebP under the submission folder); invalid URL rejected; Contact prefilled and marked private; Full consent + confirm → Thank you; reopening the link shows "Already submitted, thank you".
7. Inbox showed the submission with *New* and *Profile updates* badges → review page → quote assembled by clicking three sentences → headline added → **Published** → merge accepted (job title, website, photo, preferred contact).
8. Database confirmed: request `published` with all timestamps; testimonial published with `full` consent and photo; client record updated; activity log `created → sent → opened → started → submitted → published → updated_from_submission`.

### Issues found and fixed during verification

| Issue | Fix |
| --- | --- |
| supabase-js failed on Node 20 (no native WebSocket) | Added `ws` transport for all server clients, scripts and tests |
| Email login disabled by `[auth.email] enable_signup = false` | Re-enabled the provider flag; global sign-up stays off |
| Request page showed "screen NaN" (to-one embed returned as array) | Added `one()` normaliser and used it for to-one embeds |
| "Skip this one" did not autosave progress | Skip now saves like *Next* |
| Clickable answer sentences wrapped one per line | Rendered inline |
| Aborted test run left test data behind | Added `cleanupRun()` safety net in the isolation suite |

---

## 7. Known limitations

- Rate limiting is per server instance (in memory).
- Request status is set to *sent* on copy; an owner who types the link by hand must click *Copy* once or rely on *opened*.
- The inbox preview shows the first stored answer in Postgres `jsonb` key order, not question order.
- Detail pages use a generic browser tab title ("Dashboard").
- Owners cannot yet edit form copy (welcome, thank-you, consent wording) — defaults come from the seed; editable in Phase 2.
- The thank-you "Share my link" CTA appears only after the owner sets a share link in Settings.

---

## 8. Running Phase 1 locally

See the [README](../../README.md) for full setup. Short version:

```bash
npm install
npm run db:start
cp .env.example .env.local     # fill from `npx supabase status`, set SUPER_ADMIN_PASSWORD and IP_HASH_SALT
npm run seed:admin
npm run dev                    # http://localhost:3000
```

Local auth emails (password reset): Mailpit at http://127.0.0.1:54324.

---

## 9. Handover to Phase 2

Already in place for Phase 2:

- `form_items` has every per-item field (`default_shown`, `default_prefill`, `default_prefill_value`, `default_prefill_locked`, `archived_at`, `sort_order`).
- `buildSnapshot()` accepts per-request `overrides` and reads `clients.form_defaults`, following the brief's precedence.
- `requests.item_overrides` column exists.
- `settings_custom_fields`, `tags`, `client_tags`, `testimonial_tags` tables exist with RLS and isolation-test coverage.
- `consentViolations()` is the single place to extend consent enforcement.

Next steps: form builder with drag-and-drop (dnd-kit) and live preview; the "Customize form" step on
request creation with presets and "save as client defaults"; client "Form preferences" tab; custom
fields UI; tags UI; editable form copy; extended consent enforcement tests.
