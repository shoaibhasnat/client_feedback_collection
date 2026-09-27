## What and why

<!-- What does this change, and why? Link the issue. -->

## How I tested it

<!-- Commands run, screens checked, screenshots for UI changes. -->

## Checklist

- [ ] `npm run lint && npm run typecheck && npm test` pass
- [ ] Owner mutations start with `assertWritable()` and use the RLS-scoped `ctx.supabase`
- [ ] Any service-role query is scoped in the same function; stored storage paths pass `isSafeStoragePath()`
- [ ] New tables: RLS policies, composite FKs, immutability trigger, added to `BUSINESS_TABLES` and `EXPORT_TABLES`
- [ ] Public output only via `public_*` SQL functions, covered by the privacy test
- [ ] No owner- or client-supplied HTML/JS/URLs rendered unsafely (`safeHref()` for links)
- [ ] New migration file (no edits to released migrations)
- [ ] Docs updated (`docs/`, `CHANGELOG.md`) if behaviour changed
