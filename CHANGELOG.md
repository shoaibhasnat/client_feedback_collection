# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Planned / open for contributions
- Workspace deletion with a 30-day grace period, restorable by the super admin, then purged.
- Two-factor login (TOTP), starting with the super admin.
- Super admin per-workspace export.
- Custom `<head>` snippet for analytics beyond the built-in providers. It needs a design that keeps the shared-origin guarantees.
- Export a collection as a multi-page PDF.

## [0.1.0] — 2026-09-27

First public release.

### Added
- **Collect:**
  - private request links and a guided, mobile-first client form with autosave, resume, star rating and a video step (record or upload)
  - consent levels (Full, Partial, Anonymous, Private)
  - ready-made Upwork, email and WhatsApp messages
- **Configure:**
  - form builder with multiple templates and custom fields
  - per-client and per-request visibility, requirement and prefill settings
  - manual testimonials and tags
- **Manage:**
  - client and project CRM with notes, timeline and custom fields
  - review inbox with side-by-side editing and profile merge
  - client approval links
  - reminders
  - client CSV import and export
  - full data export
- **Showcase:**
  - themed public wall with search, tag filters, collections, single-testimonial pages, Open Graph cards and SEO
  - appearance editor with version history and custom CSS
  - embeddable widget (5 layouts)
  - PNG image cards
- **Operate:** super admin panel (workspaces, invites, users, suspension, audit log), invite-only accounts, demo seed script.

### Security
- Tenant isolation in Postgres (RLS on every table, composite foreign keys, immutable `workspace_id`).
- Consent enforced by database triggers.
- Strict storage path validation (`is_workspace_path`) after a review found a path traversal across
  workspaces. See [docs/security-review-2026-09.md](docs/security-review-2026-09.md).

### Upgrade notes
- The free Supabase plan caps uploads at 50 MB. `NEXT_PUBLIC_VIDEO_MAX_MB` defaults to 50, and migration
  `20261001000001` sets the bucket limit to match.
