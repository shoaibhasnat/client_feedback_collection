# Build history

The app was built in phases against a written product brief. Each document records that phase's scope,
acceptance criteria, how they were verified, and known limits at the time. They describe the project as it
was then: for the current design, see [Architecture](../architecture.md).

| Phase | Scope |
| --- | --- |
| [1 — Collect](phase-1.md) | Tenancy + RLS, super admin, invites, login, client/project CRM, request links, client form, inbox, testimonial editing |
| [2 — Configure](phase-2.md) | Form builder, per-client/per-request form settings, templates, custom fields, consent enforcement, manual testimonials, tags |
| [3 — Showcase](phase-3.md) | Public wall, appearance editor, filtered links, collections, single-testimonial pages, SEO |
| [4a — Video & approval](phase-4a.md) | Video record/upload and download, video on the wall, client approval flow, reminders |
| [4b — Widget, cards, CSV](phase-4b.md) | Embeddable widget, image cards, CSV import/export and full data export, custom CSS |

Some notes mention a specific demo environment (e.g. an `acme-studio` workspace). That was local test data
and is not part of the repository; use `npm run seed:demo` for your own.
