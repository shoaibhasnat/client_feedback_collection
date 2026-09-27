# Testimonial Collector

Collect structured client testimonials, keep a lightweight CRM of who you worked with, and show the
best of it on a public page, an embeddable widget and shareable image cards.

Multi-tenant from day one: each business gets an isolated **workspace**, enforced by Postgres Row Level
Security. Built with **Next.js 16** and **Supabase**, and runs on free tiers.

[Getting started](docs/getting-started.md) · [Architecture](docs/architecture.md) · [Extending](docs/extending.md) ·
[Deployment](docs/deployment.md) · [Testing](docs/testing.md) · [Contributing](CONTRIBUTING.md)

---

## Features

**Collect**
- Private request links (`/t/{token}`) open a guided, mobile-first form. It asks one question per screen, saves after every step and can be resumed.
- Clients can record a video in the browser or upload one, choose a star rating, and pick exactly how much of their name, photo and company you may show (Full, Partial, Anonymous or Private).
- A form builder with multiple templates and custom fields. Every field can be shown or hidden, made required or optional, and prefilled per client or per request.
- Ready-made messages to paste into Upwork, email or WhatsApp. The app sends no email itself, apart from password resets.

**Manage**
- A client and project CRM with notes, tags, an activity timeline and custom fields. Clients can be imported and exported as CSV.
- A review inbox shows the client's original words next to the quote you're editing. Click a sentence to add it to the quote.
- Client approval: send an approval link so the client can confirm or correct your edited wording.
- Consent is enforced in the database, so nothing can be published beyond what the client agreed to.

**Showcase**
- A themed public wall at `/{slug}` with featured testimonials, tag filters, search, collections and single-testimonial pages with Open Graph cards.
- An appearance editor: presets, light and dark palettes, fonts, section order, all text, custom CSS and version history.
- An **embeddable widget** with 5 layouts: grid, carousel, single card, scrolling wall and rating badge. It's added with a copy-paste script or iframe.
- **Image cards**: any testimonial as a PNG for Instagram, LinkedIn or stories.
- A full data export (JSON, CSV and media) for every workspace.

**Operate**
- A super admin panel for workspaces, invite links, users, suspension and an audit log. It shows metadata only, never business data.
- Invite-only accounts; public sign-up is disabled.

## Quick start

You need Node 20.9+ (22 LTS recommended) and Docker Desktop running.

```bash
git clone <this repo> testimonial-collector && cd testimonial-collector
npm install
npm run db:start                 # local Supabase in Docker, applies all migrations
cp .env.example .env.local       # then paste the URL + keys printed by `npx supabase status`
npm run seed:admin               # super admin (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD)
npm run seed:demo                # optional: demo workspace with sample testimonials
npm run dev                      # http://localhost:3000
```

The [Getting started](docs/getting-started.md) guide covers each step, plus using Supabase Cloud instead of Docker.

## Tech stack

| | |
| --- | --- |
| App | Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4 |
| Data | Supabase: Postgres 17 with RLS, Auth, Storage |
| Validation | Zod 4, with shared schemas for browser and server |
| Media | sharp (re-encodes images and strips EXIF), MediaRecorder video, `next/og` image cards |
| Tests | Vitest: unit, database isolation and HTTP tests |

## Project layout

```
supabase/migrations/   schema, RLS, triggers and public read functions (append-only)
src/app/               routes: admin/ (owners), superadmin/, t/ (client form), [slug]/ (public), embed/
src/lib/               domain logic: form engine, site theming, widget, exports, auth, storage paths
src/components/        UI primitives and public-site components
scripts/               seed scripts
tests/                 Vitest suites
docs/                  architecture, guides, security review, build history
```

## Security

Tenant isolation is enforced in Postgres, not only in application code. A [full security review](docs/security-review-2026-09.md)
of the codebase, its findings and fixes are documented, with regression tests. Please report vulnerabilities privately:
see [SECURITY.md](SECURITY.md).

## Status

Every feature in the original product brief has been built. Not built yet:
- workspace deletion with a 30-day grace period
- two-factor login (TOTP)
- per-workspace export for the super admin
- a custom `<head>` snippet
- exporting a collection as a PDF

These are good first contributions: see [CHANGELOG.md](CHANGELOG.md) and [docs/history](docs/history/).

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the
[extending guide](docs/extending.md), which walks through adding a table, a public field or a new screen
without weakening isolation.

## Credits

Created by [Shoaib Hasnat](https://www.linkedin.com/in/shoaib-hasnat-066318428/).

The app shows a small "Created by" credit in the dashboard, sign-in and public page footers. It is set in
`src/lib/credits.ts`. The MIT license lets you change or remove it in your fork. A link back is appreciated.

## License

[MIT](LICENSE)
