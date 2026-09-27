# Testimonial Collector — Phases 1–4a (Collect, Configure, Showcase, Extras part 1)

A multi-tenant web app where independent businesses collect structured client testimonials,
keep a lightweight CRM of clients and projects, and review submissions. Built from
*Testimonial Collector App — Developer Brief* (Sep 27, 2026). This repository covers **Phases 1–3 and 4a**.

**Documentation:** [Application guide](docs/APP.md) (architecture, data model, security, conventions) ·
[Phase 1 — Collect](docs/phases/PHASE-1.md) · [Phase 2 — Configure](docs/phases/PHASE-2.md) · [Phase 3 — Showcase](docs/phases/PHASE-3.md) · [Phase 4a — Video & approval](docs/phases/PHASE-4A.md) (scope, acceptance criteria, verification, handover).

**Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres, Auth, Storage, Row Level Security) ·
Tailwind CSS 4 · Zod · sharp · Vitest.

## What's in Phase 1

| Area | Included |
| --- | --- |
| Multi-tenancy | `workspace_id` on every business table, RLS on every table, composite foreign keys so rows can't reference another workspace, `workspace_id` immutable, storage scoped to `{workspace_id}/…` |
| Accounts | Super admin seeded by script; public sign-up disabled; single-use invite links (hashed, 7-day default expiry); sign-in, sign-out, password reset via Supabase's built-in email; sign-ins audited |
| Super admin (`/superadmin`) | Create workspace + invite owner, regenerate/revoke invites, rename/change slug, suspend/reactivate, users list (disable/enable, force password reset, 2FA status), invites list, audit log, global settings (app name, invite expiry, announcement banner). Metadata and counts only, never business data |
| Owner dashboard (`/admin`) | Home (counts, needs attention, onboarding checklist), clients CRUD with full profile + timestamped notes + activity timeline + "right to be forgotten" delete, projects CRUD with attachments, requests, submissions inbox, testimonial editing, settings (profile, message templates, change password) |
| Requests | Pick client/project/template, live preview (screens, time, missing-prefill warnings), personal message, optional expiry; 192-bit token link; copy link / ready-made Upwork, email, WhatsApp and reminder messages; status pipeline with timestamps; reopen, revoke, duplicate, mark reminded |
| Client form (`/t/{token}`) | Mobile-first multi-step flow rendered entirely from the request's template snapshot: welcome, rating, one question per screen, About you (with photo/logo upload, server-side crop and EXIF strip), Contact (private), Consent, Thank you with CTA. Autosave after each step, resume later, back button, honeypot, rate limits, "already submitted" state |
| Review | Inbox of submissions; raw answers on the left (click a sentence to add it to the quote), editable showcase testimonial on the right with a character counter; publish/hidden/private; consent guard blocks publishing beyond what the client agreed to; side-by-side merge of About you / Contact answers into the client profile |
| Seed | Each new workspace gets the default "Standard" template (5 questions, 7 About you fields, 4 Contact fields), message templates and a theme preset |

## What's in Phase 2

| Area | Included |
| --- | --- |
| Form builder (`/admin/forms`) | Multiple templates (create, duplicate, rename, default, archive); questions, About you and Contact fields with add/edit, drag-and-drop reorder (mouse + keyboard), archive/restore, prefill defaults and client-property mapping; rating/consent/thank-you settings; every client-facing string editable; live mobile/desktop preview |
| Per-request & per-client settings | "Customize form" step: show/hide, required/optional, prefill (client, project, custom value) and lock for every item plus rating and consent; quick presets; save as client defaults; preview built from the exact snapshot the request stores. Client "Form preferences" page |
| Custom fields | Owner-defined client and project fields (text, number, date, dropdown, URL) on forms, detail pages and as prefill/merge targets |
| Tags | Create, edit, merge, delete; tag clients and testimonials; filters; bulk publish/hide/private/tag/untag/delete |
| Consent & integrity | Enforced in Postgres: consent read from the submission, no publishing beyond it, withdrawal unpublishes, owners can't edit submissions, frozen request snapshots, media must be workspace files |

## What's in Phase 3

| Area | Included |
| --- | --- |
| Public wall (`/{slug}`) | Themed page: hero with stats and CTA, featured, all testimonials (grid/masonry) with tag chips and search in the URL, about, services, client logos, CTA footer — order and visibility set by the owner |
| Links | `/{slug}?tag=…`, collections at `/{slug}/c/{collection}` (managed in `/admin/collections`), single testimonials at `/{slug}/t/view/{id}` with Open Graph cards |
| Appearance editor | Presets, light/dark palettes, curated self-hosted fonts, shape, sections, card fields, all public copy, logos/favicon/share image/form background, SEO, allowlisted analytics, last-10 version history; live preview |
| Privacy & performance | Public pages read only through anon `public_*` SQL functions (tested: no private data in any output); Lighthouse mobile 94–96 |

## What's in Phase 4a

| Area | Included |
| --- | --- |
| Video | Optional/required video step on the client form: record in the browser (countdown, prompts, auto-stop) or upload; background upload with progress; resume. Owner can play, **download** (dashboard only) and choose to show it on the wall with a custom thumbnail; Full consent required (enforced in Postgres) |
| Public wall | Video cards with a thumbnail and play button open an accessible lightbox; video is served through a short-lived signed redirect |
| Client approval | One-time approval link (`/a/{token}`, hash stored only) for an edited quote; client approves or suggests changes; editing the quote voids the approval; approvals on Home |
| Reminders | Copying the reminder message records it; "Needs a reminder" filter counts from the last reminder |

**Deferred to later phases (by design):** embeddable widget, image cards, CSV import/export and data export,
custom CSS (Phase 4b); workspace deletion with 30-day purge, super admin per-workspace export, TOTP two-factor,
custom head snippet.

## Local setup

Requirements: Node 20.9+ (Node 22 LTS recommended; on Node 20 the app supplies `ws` as the WebSocket for supabase-js), Docker Desktop (running).

```bash
npm install
npm run db:start          # starts local Supabase and applies supabase/migrations
npx supabase status       # prints API URL, anon key, service_role key
cp .env.example .env.local
```

Fill `.env.local` with the values from `supabase status`, set `SUPER_ADMIN_PASSWORD` (12+ characters)
and a random `IP_HASH_SALT`. Then:

```bash
npm run seed:admin        # creates the super admin for SUPER_ADMIN_EMAIL
npm run dev               # http://localhost:3000
```

Sign in as the super admin, create a workspace, open the invite link in a private window,
and set the owner's password. Local auth emails (password reset) land in Mailpit at
http://127.0.0.1:54324.

### Using Supabase Cloud instead of Docker

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF      # prompts for the database password
npx supabase db push --linked                          # applies supabase/migrations
npx supabase config push                               # auth: sign-up off, 8-char passwords, redirect URLs; storage limit
```

Then set `.env.local` to the project URL and keys (Dashboard → Project Settings → API), pick a new random
`IP_HASH_SALT`, and run `npm run seed:admin`. `config push` shows a diff first: review it, because the local
`config.toml` also holds development-only values. On the free plan the storage limit is 50 MB
(migration `20261001000001` sets the bucket to match).

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public anon key (all access is still governed by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Invite acceptance, token-scoped public form, super-admin metadata, audit log |
| `NEXT_PUBLIC_APP_URL` | server | Base URL used in request and invite links |
| `IP_HASH_SALT` | server | Salt for hashing IPs in the audit log and submissions |
| `NEXT_PUBLIC_VIDEO_MAX_MB` | client + server | Largest video upload (default 50, the Supabase free-plan cap; 100 on a paid plan) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | seed script only | Super admin bootstrap |

## Tests

```bash
npm run typecheck
npm run test:unit         # form engine, snapshot, validation, consent guard (no database needed)
npm run test:isolation    # needs local Supabase running and .env.local filled in
```

The isolation suite creates two workspaces with a row in every business table plus a stored file, then
asserts that owner A cannot list, read, update, delete, insert into, cross-link to, or download anything of
workspace B. It also checks that anonymous users see nothing, sign-up is disabled, privileged functions are
not callable, request tokens resolve to exactly one workspace, and suspension and disabling behave as specified.

## Deploy (Vercel + Supabase Cloud)

1. Create a Supabase project. In **Auth → Providers → Email**, turn off "Allow new users to sign up".
   Set **Site URL** to your production URL and add `https://your-app/auth/confirm` to the redirect URLs.
2. Link and push the schema: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Import the repo into Vercel and set the environment variables above (`NEXT_PUBLIC_APP_URL` = production URL).
4. Run `npm run seed:admin` locally with the production URL/keys in the environment to create the super admin.
5. Supabase's daily backups are on by default for hosted projects.

## Security notes

- Isolation is enforced in Postgres (RLS + composite FKs), not only in application code. The service-role client
  is used only in server code that scopes each query explicitly (see `src/lib/supabase/admin.ts`).
- Invite tokens are stored as SHA-256 hashes only. Request tokens are 192-bit random.
- Uploaded images are validated and re-encoded server-side with sharp, which strips EXIF (including GPS).
  Everything lives in a private bucket and is served through short-lived signed URLs.
- `/t/*` and `/invite/*` send `no-referrer`, `noindex` and `no-store` headers.
- Rate limiting is in-memory (fine for one instance at the brief's scale); swap in a shared store if you scale out.
- For Upwork clients, frame request links as feedback only, ideally after the contract ends.

## Project layout

```
supabase/migrations/     schema, RLS, workspace seeding, storage policies
scripts/seed-superadmin.ts
src/proxy.ts             session refresh + auth gate for /admin and /superadmin
src/lib/                 auth, supabase clients, form engine (snapshot, steps, validation), uploads, consent
src/app/superadmin/      super admin panel
src/app/admin/           owner dashboard
src/app/t/[token]/       client-facing testimonial form
src/app/invite/[token]/  invite acceptance
tests/                   unit + isolation tests
```
