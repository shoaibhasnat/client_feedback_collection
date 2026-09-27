# Testing

```bash
npm run typecheck
npm run lint
npm run test:unit     # no database needed (a few seconds)
npm run test:db       # needs a Supabase stack + .env.local; HTTP tests also need `npm run dev` running
npm test              # everything
```

## Suites

| Suite | Needs | Covers |
| --- | --- | --- |
| `form.test.ts`, `form-settings.test.ts` | nothing | Form engine: snapshots, per-item settings precedence, steps, validation, consent text |
| `site-config.test.ts` | nothing | Theme, layout and SEO parsing, presets, CSS generation |
| `security.test.ts` | nothing | Redirect safety and other pure security helpers |
| `isolation.test.ts` | database | **Tenant isolation**: two workspaces with a row in every business table plus a file; owner A can't list, read, update, delete, insert into, cross-link to or download anything of B. Anonymous users see nothing |
| `phase2.test.ts` | database | Consent enforcement, submission integrity, frozen snapshots, custom fields |
| `phase3.test.ts` | database (+ server) | Public API returns public columns only. No private value appears in any public response or page source |
| `phase4a.test.ts` | database (+ server) | Video consent rules, storage, media route, approval page, reminders |
| `phase4b.test.ts` | database (+ server) | Widget API and embed, custom CSS rules, CSV, full export, image cards |
| `security-review.test.ts` | database | Regression tests for the security review: path traversal, consent unlinking, direct-API attacks, safe links |

Suites that need the server skip their HTTP tests automatically when `NEXT_PUBLIC_APP_URL` isn't reachable.

## How the database tests work

`tests/helpers.ts → createTenant()` creates a workspace with an owner and one row in every business table,
then signs in as that owner with the anon key. That's the same position as a real user calling the
Supabase API directly. Tests then attack through that session. Everything is deleted afterwards
(`destroyTenant`, `cleanupRun`), and all names include a random run id so parallel runs don't collide.

**Adding a business table?** Add it to `BUSINESS_TABLES` in `tests/helpers.ts` and give it a fixture row
in `createTenant`, so the isolation suite covers it automatically.

## Writing tests

- **Pure logic** goes in `src/lib/**` and is tested without a database.
- **Security properties** are tested through the owner's own session (`tenant.client`), not the service role.
- **Public output tests** plant distinctive private values and assert they never appear. See `phase3.test.ts` for the pattern.
- `server-only` is aliased to an empty module in `vitest.config.ts`, so server modules can be imported directly.

## Continuous integration

`.github/workflows/ci.yml` runs two jobs:
- **Lint, typecheck, unit tests and build** on every push and pull request.
- **Database tests**: starts Supabase in the runner, applies the migrations, builds and starts the app, then runs `test:db`.
