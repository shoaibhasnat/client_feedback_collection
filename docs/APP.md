# Testimonial Collector — Application Guide

This is the app-level reference: what the system is, how it is put together, and the rules
that every phase builds on. Phase-specific scope, status and verification live in
[`docs/phases/`](phases/). Setup and deploy commands live in the [README](../README.md).

- **Source of truth for requirements:** *Testimonial Collector App — Developer Brief* (Sep 27, 2026), in the parent folder.
- **Current state:** Phases 1–3 (Collect, Configure, Showcase) complete. See [Phase 1](phases/PHASE-1.md) · [Phase 2](phases/PHASE-2.md) · [Phase 3](phases/PHASE-3.md).

---

## 1. What the app does

A multi-tenant web app where independent businesses (freelancers, agencies, small companies) each:

1. **Collect** structured, results-focused testimonials from clients through a guided, mobile-first form opened from a private link.
2. **Manage** everything they know about clients and projects in a lightweight CRM.
3. **Showcase** approved testimonials on a public page, filtered links, an embeddable widget and image cards (Phases 3–4).

Each business works in its own **workspace** with fully isolated data. There is no public sign-up:
a **super admin** creates workspaces and invites owners.

### Roles

| Role | How they get in | What they can do |
| --- | --- | --- |
| Super admin | Seeded by script (`SUPER_ADMIN_EMAIL`). No UI grants this role. | Manage workspaces, invites, users, global settings and the audit log. Sees **metadata and counts only**, never business data. |
| Workspace owner | Accepts a single-use invite link | Everything inside their own workspace: clients, projects, requests, submissions, testimonials, settings. |
| Client (respondent) | Opens a request link `/t/{token}`. No account. | Fills in the testimonial form for that one request. |
| Visitor | Public URLs (Phase 3+) | Views published, consent-limited testimonials. |

### Phase roadmap

| Phase | Name | Scope | Status |
| --- | --- | --- | --- |
| 1 | Collect | Tenancy + RLS, super admin, invites, login, clients/projects CRM, request links, client form (no video), inbox, basic testimonial editing | ✅ Done — [details](phases/PHASE-1.md) |
| 2 | Configure | Form builder, per-client/per-request form settings, multiple templates, custom fields, full consent enforcement, manual testimonials, tags | ✅ Done — [details](phases/PHASE-2.md) |
| 3 | Showcase | Public wall, appearance/theme editor, filtered links, collections, single-testimonial pages, SEO | ✅ Done — [details](phases/PHASE-3.md) |
| 4a | Extras (part 1) | Video record/upload + download, video on the wall, client approval flow, reminders polish | ✅ Done — [details](phases/PHASE-4A.md) |
| 4b | Extras (part 2) | Embeddable widget, image cards, CSV import/export + data export, custom CSS | ✅ Built — [details](phases/PHASE-4B.md) |

---

## 2. Technology

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) | Uses `proxy.ts` (formerly middleware), async request APIs, Server Actions. Version-matched docs ship in `node_modules/next/dist/docs/`. |
| UI | React 19, Tailwind CSS 4, lucide-react | Small hand-written primitives in `src/components/ui` (shadcn-style) instead of the shadcn CLI. |
| Database, auth, storage | Supabase (Postgres 17, GoTrue, Storage) | Row Level Security on every table. |
| Supabase clients | `@supabase/ssr`, `@supabase/supabase-js` | On Node 20 the `ws` package is passed as the realtime transport (`src/lib/supabase/transport.ts`). |
| Validation | Zod 4 | Form schemas are generated at runtime from form items. Shared by browser and server. |
| Images | sharp | Server-side validation, re-encode to WebP, EXIF strip, square crop. |
| Tests | Vitest 3 | Unit tests + database isolation tests against local Supabase. |
| Hosting target | Vercel + Supabase Cloud (free tiers) | See README → Deploy. |

Runtime: Node 20.9+ works; **Node 22 LTS is recommended**.

---

## 3. Architecture

```
Browser ──► proxy.ts (session refresh, gate /admin & /superadmin)
   │
   ├── /login, /forgot-password, /reset-password, /auth/confirm   auth pages
   ├── /invite/[token]                                             invite acceptance
   ├── /superadmin/**   ─► requireSuperAdmin() (every page + action) ─► service-role client (metadata only)
   ├── /admin/**        ─► requireOwner()      ─► user client (RLS-scoped)
   ├── /t/[token]       ─► loadRequestByToken() ─► service-role client pinned to one request
   ├── /{slug}, /{slug}/c/{c}, /{slug}/t/view/{id} ─► anon client ─► public_* SECURITY DEFINER functions
   └── /api/public/{media,brand,og}/…  ─► DB-approved path ─► stream from private bucket / render card
                                                     │
                                          Supabase: Postgres (RLS) + Storage (private bucket)
```

### Two kinds of database access

| Client | File | Used by | Guarantee |
| --- | --- | --- | --- |
| **User client** (anon key + session cookie) | `src/lib/supabase/server.ts` | Owner dashboard, all owner Server Actions | Postgres RLS limits every query to the caller's workspace. App code cannot bypass it. |
| **Anon client + public functions** | `src/lib/site/public-data.ts` | Public wall, collections, single pages, OG cards | Anon has no table access; `public_*` functions return public columns of published items in active workspaces only. |
| **Service-role client** | `src/lib/supabase/admin.ts` | Public token form, invite acceptance, super admin panel, audit log, sign-in bookkeeping | Bypasses RLS. **Every query must be scoped explicitly** (by token, invite hash, or super-admin check). Server-only (`import "server-only"`). |

Rule of thumb: owner features always use the user client. Reach for the service-role client only
when there is no signed-in owner (token form, invites) or the caller is the super admin, and scope
the query in the same function.

### Authorization layers

1. **`src/proxy.ts`** — refreshes the Supabase session cookie; redirects signed-out users away from `/admin` and `/superadmin`. Convenience only, not the security boundary.
2. **`src/lib/auth.ts`** — `requireOwner()`, `requireSuperAdmin()`, `assertWritable()`. Called in every layout, page and Server Action. Verifies the JWT via `getUser()`, checks profile status and workspace membership.
3. **Postgres RLS** — the real boundary for owner data (see §5).

### Request lifecycle (the core flow)

```
Owner creates request ──► template snapshot frozen into requests.template_snapshot
        │                  (items + resolved visibility/requirement/prefill + context)
        ▼
 draft ─(owner copies link/message)─► sent ─(client opens)─► opened ─(first autosave)─► in_progress
        ─(client submits)─► submitted ─(owner saves testimonial)─► reviewed | published | private
```

Side states: `revoked_at` (link stops working), `expires_at` (link expires), reopen (clears
`submitted_at`/`revoked_at` so the client can edit again). Every transition is timestamped and written
to `activity_log`.

---

## 4. Source layout

```
app/
├─ supabase/
│  ├─ config.toml                     local stack config (public sign-up disabled)
│  └─ migrations/
│     ├─ 20260927000001_core.sql      enums, tables, tenancy helpers, RLS, triggers
│     ├─ 20260927000002_seed_storage.sql  seed_workspace(), superadmin stats, storage bucket + policies
│     ├─ 20260928000001_phase2_configure.sql  prefill field, presets, submission column grants,
│     │                                  consent + media triggers, frozen snapshots
│     └─ 20260929000001_phase3_public_api.sql  anon-callable public_* read functions
├─ scripts/seed-superadmin.ts         super admin bootstrap
├─ src/
│  ├─ proxy.ts                        session refresh + auth gate
│  ├─ lib/
│  │  ├─ supabase/{server,admin,transport}.ts
│  │  ├─ auth.ts                      requireOwner / requireSuperAdmin / assertWritable
│  │  ├─ form/
│  │  │  ├─ types.ts                  FormItemRow, ItemSettings, SnapshotItem, TemplateSnapshot, FormPreset, Step
│  │  │  ├─ settings.ts               per-item settings: precedence, presets, diffs, input cleaning
│  │  │  ├─ snapshot.ts               buildSnapshot(): freeze template + resolve per-item settings
│  │  │  ├─ steps.ts                  buildSteps, validation (Zod), sanitizeValues, consentText
│  │  │  └─ catalog.ts                type labels, section/type rules, mapping compatibility
│  │  ├─ form-customize.ts            request overrides / client defaults as diffs, preview extras
│  │  ├─ form-preview.ts              builder preview (sample client)
│  │  ├─ custom-fields.ts             custom field types, parsing, formatting
│  │  ├─ tags.ts                      tag types, colours, id picking
│  │  ├─ site/                        public site: config (theme/layout/SEO schemas, presets, CSS),
│  │  │                               public-data (cached anon reads), cache (tags), media, og, seo, fonts, types
│  │  ├─ requests.ts                  prepareSnapshot, insertRequest, buildMessage
│  │  ├─ public-form.ts               loadRequestByToken, branding, signed form images
│  │  ├─ invites.ts                   issueInvite (hash-only storage), lookupInvite
│  │  ├─ consent.ts                   consentViolations() publishing guard
│  │  ├─ uploads.ts                   processImage (sharp), storeImage, signPaths, removeFolder
│  │  ├─ audit.ts                     logAudit (platform), logActivity (workspace timeline)
│  │  ├─ crypto.ts, rate-limit.ts, superadmin.ts, constants.ts, utils.ts, env.ts
│  ├─ components/                     AppShell, AuthShell, NavLinks, ui primitives
│  └─ app/
│     ├─ login, forgot-password, reset-password, auth/confirm, invite/[token]
│     ├─ superadmin/                  workspaces, workspaces/[id], users, invites, audit, settings
│     ├─ admin/                       home, clients, projects, requests, testimonials, forms, settings
│     └─ t/[token]/                   public client form (page, actions, form-flow)
├─ tests/                             form.test.ts, isolation.test.ts, helpers.ts
└─ docs/                              APP.md (this file), phases/PHASE-N.md
```

Conventions per route folder: `page.tsx` (server component, data loading), `actions.ts`
(`"use server"` mutations), `*-form.tsx` (client components using `useActionState`).

---

## 5. Multi-tenancy and isolation

**Invariant:** every row of business data belongs to exactly one workspace, and no workspace can
read, list, write or infer another's data — enforced in Postgres, not only in app code.

| Mechanism | Where | What it prevents |
| --- | --- | --- |
| `workspace_id uuid not null` on every business table, indexed | core migration | Unscoped data |
| Default `workspace_id = current_workspace_id()` | core migration | Forgetting to set it on insert |
| RLS policies `ws read/insert/update/delete` generated for all 19 business tables | core migration (DO loop) | Cross-workspace reads/writes via any client |
| `is_member(ws)` for reads, `can_write(ws)` for writes (member **and** workspace `active`) | tenancy helpers | Writes in suspended workspaces; access by disabled users |
| Composite FKs `(workspace_id, parent_id) → parent(workspace_id, id)` | core migration | Linking a row to another workspace's client/project/etc. |
| `forbid_workspace_change` trigger | core migration | Moving a row into another workspace |
| Storage path `{workspace_id}/…` + policies using `my_workspace_ids()` | storage migration | Reading/listing/writing another workspace's files |
| Private bucket, signed URLs (1h) | `uploads.ts` | Public access to raw uploads |
| `revoke all … from anon` on business tables | core migration | Anonymous table access |
| Privileged functions revoked from `authenticated` | storage migration | Calling `seed_workspace`, `superadmin_workspace_stats` |
| Column grants on `profiles` (only `name`, `avatar_url` updatable) | core migration | Self-promotion to super admin / re-enabling |

Tenancy helper functions (all `security definer`, `search_path = ''`):
`my_workspace_ids()`, `current_workspace_id()`, `is_member(ws)`, `can_write(ws)`, `is_super_admin()`.

Uniqueness is per workspace where the brief requires it: `unique (workspace_id, name)` on tags,
`unique (workspace_id, slug)` on collections, `unique (workspace_id, entity, key)` on custom fields.

**Verified by** `tests/isolation.test.ts` (see [Phase 1 → Verification](phases/PHASE-1.md#6-verification)).

---

## 6. Data model

All tables: `id uuid`, `created_at`, `updated_at` (trigger-maintained). Flexible data lives in `jsonb`.

### Platform tables (no `workspace_id` RLS; service-role or narrow policies)

| Table | Purpose / key columns |
| --- | --- |
| `workspaces` | `name`, `slug` (unique, regex-checked), `status` (active/suspended/deleted), `public_key`, `deleted_at` |
| `profiles` | 1:1 with `auth.users`; `email`, `name`, `is_super_admin`, `status` (active/disabled), `last_sign_in_at`. Created by `on_auth_user_created` trigger. |
| `workspace_members` | `workspace_id`, `user_id`, `role` (`owner` only in v1). Kept for future team members. |
| `invites` | `email`, `token_hash` (SHA-256, never plaintext), `status`, `expires_at`, `accepted_at` |
| `audit_log` | Super admin actions and every sign-in: `actor_user_id`, `workspace_id`, `action`, `target_*`, `meta`, `ip_hash` |
| `global_settings` | Single row: `app_name`, `invite_expiry_days`, `announcement` |

### Business tables (all workspace-scoped with RLS)

| Table | Purpose / key columns |
| --- | --- |
| `clients` | Full CRM profile: contact fields, `emails jsonb[]`, `source`, `referred_by_client_id`, `status`, dates, `custom_fields`, `form_defaults` |
| `client_notes` | Timestamped private notes log |
| `projects` | `client_id`, platform, dates, status, `budget`/`currency` (private), `links jsonb`, `outcomes`, `notes` |
| `attachments` | Files on a client or project (`owner_type`, `owner_id`, storage `file_url`) |
| `form_templates` | `name`, `is_default` (one per workspace), `settings jsonb`, `copy jsonb`, `archived_at` |
| `form_items` | Questions / About You / Contact fields: `section`, `key` (immutable), `type`, `options`, `required`, `visibility`, `maps_to_client_field` (incl. `custom:<key>`), `default_shown`, `default_prefill` + `default_prefill_field` / `default_prefill_value` / `default_prefill_locked`, `sort_order`, `archived_at` |
| `requests` | `token` (unique, ≥128-bit), `template_snapshot jsonb` (frozen), `item_overrides`, `personal_message`, `status` + timestamps, `expires_at`, `revoked_at` |
| `submissions` | Raw client data, **never overwritten by the owner** (owners may only update `merge_status`, `merge_resolved_at`, `submitted_at`): `answers`, `about`, `contact`, `rating`, `consent_level`, `consent_text`, `consent_at`, `progress_step`, `submitted_at`, `merge_status`, `ip_hash`, `user_agent` |
| `testimonials` | Editable showcase layer: `display_quote`, `headline`, display fields, `photo_url`/`logo_url`, `consent_level` copy, `visibility` (published/hidden/private), `featured`, `source` (form/upwork_review/manual), `proof_url` |
| `tags`, `testimonial_tags`, `client_tags` | Labels (UI in Phase 2) |
| `collections`, `collection_items` | Hand-picked sets (Phase 3) |
| `widgets` | Embed configs (Phase 4) |
| `site_settings` | One row per workspace: `profile`, `theme`, `layout`, `seo`, `custom_css`, `message_templates`, `form_presets`, `onboarding` |
| `theme_versions` | Theme history (Phase 3) |
| `settings_custom_fields` | Owner-defined client/project fields (Phase 2) |
| `activity_log` | Workspace timeline: `client_id`, `entity_type`, `entity_id`, `action`, `meta` |

Relationships: client → many projects, requests, notes, testimonials; project → many requests;
request → 0..1 submission; submission → 0..1 testimonial.

**Key rule (brief §2):** submission data is never modified by owner actions. The testimonial is a
separate layer, so the client's original wording is always preserved.

### Template snapshot

`requests.template_snapshot` is a self-contained JSON document (`TemplateSnapshot` in
`src/lib/form/types.ts`) holding the template settings and copy, every active item with its **resolved**
`shown`, `required`, `prefill_value`, `prefill_locked`, the render context (`client_first_name`,
`project_name`, `company`) and the owner's display info. The client form renders **only** from this
snapshot, so editing a template never changes an in-flight request or an existing submission.
Per-item settings (visibility, requirement, prefill source/value, locked) resolve **request override →
client `form_defaults` → template default** (`lib/form/settings.ts`). Rating and consent are pseudo-items
(`__rating`, `__consent`); hiding consent fixes the answer to Private. `requests.item_overrides` and
`clients.form_defaults` store only the differences from their baseline. Snapshots are immutable once
written (trigger). Version 1 snapshots (Phase 1) remain readable.

### Workspace seed (`seed_workspace(ws)`)

Run by the server whenever a workspace is created. Creates `site_settings` (profile, "minimal" theme
preset, message templates, reminder days = 3) and the default **Standard** template:

- 5 guided questions (situation before, what almost stopped you, result, working together, who to recommend)
- 7 About You fields (full name, job title, company, website, LinkedIn, photo, company logo), prefilled from the client record
- 4 Contact fields (email, WhatsApp/phone, preferred contact method, country/time zone), always private

---

## 7. Security and privacy

| Topic | Implementation |
| --- | --- |
| Accounts | Supabase Auth email + password. Public sign-up disabled (`[auth] enable_signup = false`). Accounts only via invite or seed script. |
| Invites | 256-bit random token, only SHA-256 hash stored, single-use (claimed atomically), 7-day default expiry, regenerate revokes earlier links. |
| Request tokens | 192-bit random, base64url. Format-checked before lookup. |
| Rate limiting | In-memory fixed window (`rate-limit.ts`): login, password reset, invite acceptance, token lookup, autosave, uploads, submit. Swap for a shared store if horizontally scaled. |
| Spam | Honeypot field on the client form (bot submissions are silently discarded). |
| Uploads | Type + size checked; images decoded and re-encoded with sharp (strips EXIF incl. GPS); PDFs checked for `%PDF-` magic. Stored privately, served via short-lived signed URLs. |
| Headers | `nosniff`, `SAMEORIGIN` frame policy, strict referrer; `/t/*` and `/invite/*` add `no-referrer`, `noindex`, `no-store`. |
| IP addresses | Only salted hashes are stored (`IP_HASH_SALT`). |
| Consent | Level, exact text shown and timestamp stored per submission. Enforced in the database: the `enforce_testimonial_rules` trigger reads consent from the submission and rejects publishing beyond it; withdrawal auto-unpublishes. `consentViolations()` mirrors the rules in the UI. |
| Submission integrity | Owners can't insert submissions or change answers/consent (column-level grants). |
| Media references | Testimonial photo/logo must be files in the workspace's folder; proof may also be an http(s) link (trigger). |
| Public pages | Read only through anon `public_*` functions (explicit public columns, published only, active workspaces). Media streamed only for DB-approved paths. Tested: no private value in any public response or page source. |
| Shared origin | No owner-supplied HTML/JS on public pages: theme CSS built from validated values; analytics limited to Plausible/GA4 IDs; custom CSS (Phase 4) must be scoped and sanitised. |
| Right to be forgotten | Deleting a client cascades to projects, requests, submissions, testimonials, notes, activity and removes their files. |
| Super admin | Server-side check on every request and action; no business data in the panel; no impersonation. |
| Suspension | Owner read-only (enforced by `can_write` in RLS); request links show "temporarily unavailable". |
| Disabled user | Auth ban + `profiles.status = disabled`; `my_workspace_ids()` returns nothing for them even with a live session. |

---

## 8. Configuration

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public key; all access still governed by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Service-role client |
| `NEXT_PUBLIC_APP_URL` | server | Base URL in request and invite links |
| `IP_HASH_SALT` | server | Salt for IP hashing |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | seed script | Super admin bootstrap (password ≥ 12 chars) |

`next.config.ts` raises the Server Action body limit to 18 MB (image uploads go through Server Actions).

### npm scripts

| Script | Does |
| --- | --- |
| `dev`, `build`, `start` | Next.js |
| `typecheck`, `lint` | `tsc --noEmit`, ESLint |
| `test`, `test:unit`, `test:isolation` | Vitest (isolation needs local Supabase + `.env.local`) |
| `db:start`, `db:stop`, `db:reset` | Local Supabase stack |
| `seed:admin` | Create/update the super admin |

---

## 9. Conventions for contributors

- **Read the bundled Next.js docs** (`node_modules/next/dist/docs/`) before using an API; v16 differs from older versions (see `AGENTS.md`).
- **Owner mutations** start with `assertWritable()` and use `ctx.supabase` (RLS). Pass `workspace_id: ctx.workspace.id` explicitly on inserts.
- **Service-role queries** must be scoped in the same function; add a comment saying how.
- **Never modify `submissions`** from owner features except merge bookkeeping (`merge_status`) and reopen (`submitted_at`).
- **New business table?** Add `workspace_id` + composite FKs, append it to both DO-loop arrays in a new migration (RLS + immutability), and add it to `BUSINESS_TABLES` in `tests/helpers.ts` so isolation tests cover it.
- **Form behaviour** comes from the snapshot only; new item settings belong in `ItemSettings`, `resolveSettings` and `buildSnapshot`.
- **Previews** render the real `FormFlow` with `preview` — never build a parallel renderer, or "the preview matches" stops being guaranteed.
- **Consent rules** live in `public.consent_violation()` (database) and `lib/consent.ts` (UI); change both together.
- **Keys are permanent**: form item keys and custom field keys/types never change after creation.
- **Public output**: never query tables for public pages — extend a `public_*` function (explicit columns) and add the new field to the private-data test in `tests/phase3.test.ts`.
- **Cache**: any owner change that can alter public output must call `revalidateSite(workspaceId)`.
- **To-one embeds** from PostgREST can arrive as objects or arrays; normalise with `one()` from `lib/utils`.
- Log owner-visible events with `logActivity`; log platform/security events with `logAudit`.
- Keep migrations append-only; never edit a migration that has been applied to a shared database.
