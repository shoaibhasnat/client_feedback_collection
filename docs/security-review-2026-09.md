# Security review — whole project (27 Sep 2026)

**Scope:** Phases 1–4b, reviewed against the live Supabase Cloud project.

**Threat model:** the main attacker is a **malicious workspace owner**. Owners can call the Supabase API directly with their own session, skipping the app. Other attackers considered:
- anyone holding a client request link or approval link
- anonymous visitors to public pages and widgets

Public pages live on the same domain as the dashboard, so any script injection there would run as whichever signed-in owner or super admin visits the page.

**Result:** 1 critical issue and 3 hardening issues found and fixed, with a database migration and 14 new regression tests. The full suite is 245 passing.

---

## Findings and fixes

### 1. Critical: storage path traversal across workspaces

**The problem:** media paths were checked with "starts with `{workspace_id}/`". Storage clients resolve `..` segments, including `%2e%2e`, before sending the request. So `{myWs}/../{otherWs}/…/photo.webp` passed the check but addressed another workspace's file. Confirmed live: the service role downloaded and signed another workspace's file this way.

**Where it could be exploited:** owners can write these paths through the API, and three places act on them with the service role:
- **public media and brand routes:** a traversal path stored on a published testimonial, or in site settings, was streamed publicly
- **client form image signing:** signed URLs were issued for a path the owner froze into a request snapshot or set on a client record
- **form branding:** the owner photo and background image

**How hard to exploit:** the attacker also needs the victim's exact path, which contains random tokens. That makes it hard in practice, but it still broke tenant isolation.

**Fix:**
- Migration `20261003000001_security_storage_paths.sql` adds `is_workspace_path(path, ws)`. It accepts only the exact shape the app creates: `{uuid}/{folder}/…/{name}[.ext]`, with no dots in folders, no `..`, `%`, backslashes or empty segments.
- It is used by the testimonial rules trigger (photo, logo, video, thumbnail, proof) and by `public_media_path` and `public_brand_path`.
- The app has the same rule in `src/lib/storage-path.ts`. It is applied everywhere a path reaches the service role or a download:
  - form image signing, prefill scrubbing and branding
  - video upload, finish and removal, and the video draft on the form page
  - the image-card route and client-profile merge
  - the public media routes, as a second layer

### 2. High: consent could be escaped by unlinking a testimonial

**The problem:** an owner could set `submission_id = null` through the API. That turned a client's testimonial into a "manual" one whose consent level the owner chooses, bypassing the database consent rules.

**Fix:** the trigger now refuses to change `submission_id` once it is set.

### 3. Medium: a request link could fill the shared storage bucket

**The problem:** one bucket serves every workspace, and the free plan allows 1 GB for the whole project. A request link could keep starting video uploads without finishing them (up to 50 MB each), or keep uploading images. Rate limits slowed this down but didn't cap it, so one link could exhaust storage for all tenants.

**Fix:**
- Each submission may hold at most 20 files.
- Starting a new video upload deletes any earlier unfinished upload; the attached video is kept.

### 4. Low (defence in depth): links built from stored URLs

**The problem:** several `<a href>` values come from stored data:
- the thank-you button link in the owner's form template
- client LinkedIn, website and Upwork links (clients can submit these)
- project links
- proof links

React 19 already neutralises `javascript:` URLs, so this was not exploitable.

**Fix:** added `safeHref()`, which allows only `http(s)` and `mailto`, and applied it to every such link.

---

## Checked and found sound

- **Server actions:** every `"use server"` export in `/admin` and `/superadmin` checks auth before doing anything: `assertWritable`, `requireOwner` or `requireSuperAdmin`.
- **Route handlers:** each file export, image card and embed preview route checks the owner first.
- **Database:**
  - RLS is on for every table.
  - Owners may update only `name` and `avatar_url` on their profile, so they can't grant themselves super admin. This was tested live.
  - Owners have no write access to workspaces, memberships, invites or the audit log.
  - Composite foreign keys stop rows from linking across workspaces.
  - Submissions are write-protected by column grants; `seed_workspace` and `superadmin_workspace_stats` are revoked from users.
  - Disabled users and deleted workspaces drop out of every membership check.
- **Storage policies:** every select, insert, update and delete is limited to the caller's own workspace folder.
- **Tokens:**
  - Request tokens are 192-bit.
  - Invite and approval links store only a SHA-256 hash, are single-use or expire, and send no-referrer and noindex headers.
  - Invites are claimed atomically.
- **Public pages:**
  - Data comes only through anon `public_*` functions that return public columns.
  - JSON-LD is escaped.
  - Analytics accepts only a validated provider ID, never pasted script.
  - Custom CSS is validated on save and again when the page renders, and scoped to the public page.
  - CTA and contact links are limited to `https:`/`mailto:`.
  - Theme CSS is built only from validated values.
- **Widget:**
  - Snippets carry the workspace public key, not its internal id.
  - Only `/embed/*` can be framed by other sites; everything else sends `SAMEORIGIN`.
  - The loader accepts height messages only from the app's origin and its own frame.
- **Exports:**
  - They use the owner's own session, so row-level security limits them to one workspace.
  - Request and approval tokens are left out.
  - CSV cells that a spreadsheet would treat as formulas are neutralised.
- **Redirects:** `next` parameters are checked with `safeRelativePath`, which blocks open redirects.
- **Secrets:** only `.env.example` is tracked in git, and no key appears in any commit. The service-role key is only imported by server code.
- **Dependencies:** `npm audit --omit=dev` found 0 vulnerabilities.

---

## Remaining risks (not critical, owner's decision)

| Risk | Note |
| --- | --- |
| No two-factor login | Deferred in Phase 1. The super admin account is password-only; enable TOTP before real use |
| In-memory rate limits | Correct for a single server instance. On several instances (e.g. Vercel scaling), move them to a shared store such as Upstash |
| No site-wide Content-Security-Policy | Mitigated by React escaping, validated CSS and URLs, and allowlisted analytics. A strict CSP (nonces) would add another layer |
| Signed media URLs | Signed URLs issued to owners and to the client form stay valid for up to 1 hour after being issued, even if access is later removed |
