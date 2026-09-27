<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules (Testimonial Collector)

- Multi-tenant: isolation is enforced by Postgres RLS. Owner code uses `requireOwner()`/`assertWritable()` and `ctx.supabase`; the service-role client (`createAdminClient()`) is only for token pages, super admin and public media, and every query must be scoped in the same function.
- Stored storage paths are untrusted: check with `isSafeStoragePath()` (`src/lib/storage-path.ts`) before any service-role read/sign/delete.
- Public pages share the dashboard's origin: never render owner- or client-supplied HTML/JS; links go through `safeHref()`; public data only via `public_*` SQL functions.
- Migrations are append-only (`npx supabase migration new <name>`). New business tables need RLS, composite FKs, and an entry in `tests/helpers.ts → BUSINESS_TABLES` and `src/lib/export.ts → EXPORT_TABLES`.
- Recipes and conventions: `docs/extending.md`, `docs/architecture.md`.
