# Contributing

Thanks for helping. Bug reports, fixes, docs and features are all welcome.

## Before you start

- **Bugs:** open an issue with steps to reproduce. **Security issues:** don't open an issue; follow [SECURITY.md](SECURITY.md).
- **Features:** open an issue first to agree on the approach, especially for anything touching the database schema, auth or public pages.
- Good first contributions:
  - the unbuilt items listed in the [README](README.md#status)
  - more widget layouts or image card designs
  - translations of the default copy
  - docs

## Development setup

Follow [docs/getting-started.md](docs/getting-started.md). In short:

```bash
npm install
npm run db:start && cp .env.example .env.local   # fill in from `npx supabase status`
npm run seed:admin && npm run seed:demo
npm run dev
```

## Making a change

1. Branch from `main`.
2. Read [docs/extending.md](docs/extending.md). It has the patterns for owner screens, tables, public
   fields and files, and the rules that keep workspaces isolated.
3. Keep changes focused. Match the surrounding code's style, naming and comment density.
4. **Database:**
   - add a new migration with `npx supabase migration new <name>`
   - never edit a migration that has already been released
   - every new business table needs RLS, composite foreign keys and a line in `tests/helpers.ts → BUSINESS_TABLES`
5. **Tests:** add or update tests for behaviour you change. Security-relevant behaviour must be tested
   through an owner's own session (`tenant.client`), not the service role.
6. Run everything before pushing:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
   `npm test` needs the local Supabase stack and `npm run dev` running for the HTTP tests.

## Pull requests

- Describe **what** changed and **why**, and how you tested it. Add screenshots for UI changes.
- Tick the checklist in the pull request template. It mirrors the security rules in `docs/extending.md`.
- CI runs lint, typecheck, unit tests, a production build, and the database suite against a fresh Supabase stack.

## Code conventions

- **TypeScript:** strict mode, Zod at every boundary. No `any` unless unavoidable and commented.
- **Server Actions** start with `assertWritable()` (owners) or `requireSuperAdmin()`.
- **UI copy** is plain English and speaks to the owner ("your clients"). Keep it short and specific.
- **Accessibility:**
  - every input has a label
  - interactive elements work with the keyboard
  - status messages use `role="status"` or `role="alert"`
- **Next.js 16:** check `node_modules/next/dist/docs/` before using an API; see `AGENTS.md`.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold it.
