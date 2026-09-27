# Testimonial Collector — Phase 1 (Collect)

A multi-tenant web app where independent businesses collect structured client testimonials,
keep a lightweight CRM of clients and projects, and review submissions. Built from
*Testimonial Collector App — Developer Brief* (Sep 27, 2026). This repository covers **Phase 1**.

**Documentation:** [Application guide](docs/APP.md) (architecture, data model, security, conventions) ·
[Phase 1 — Collect](docs/phases/PHASE-1.md) (scope, acceptance criteria, verification, handover).

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

**Deferred to later phases (by design):** form builder and per-client/per-request overrides UI (Phase 2; the
snapshot engine already supports overrides), tags UI, public wall/collections/SEO (Phase 3), video, widget,
image cards, client approval flow, CSV import/export, workspace deletion with 30-day purge and data export (Phase 4),
TOTP two-factor.

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

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public anon key (all access is still governed by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Invite acceptance, token-scoped public form, super-admin metadata, audit log |
| `NEXT_PUBLIC_APP_URL` | server | Base URL used in request and invite links |
| `IP_HASH_SALT` | server | Salt for hashing IPs in the audit log and submissions |
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
