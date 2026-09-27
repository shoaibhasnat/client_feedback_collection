# Extending

Recipes for the changes people make most often. Each keeps the guarantees in [Architecture](architecture.md):
**workspace isolation in Postgres**, **the client's original submission is never modified**, and
**nothing private or executable reaches a public page**.

Before writing code, read the bundled Next.js docs in `node_modules/next/dist/docs/`. Next.js 16 differs
from older versions: it uses `proxy.ts`, async `params` and `cookies()`, and the `PageProps`/`RouteContext`
helpers. See `AGENTS.md`.

---

## The three ways to reach the database

| You are writing… | Use | Why |
| --- | --- | --- |
| An owner screen or action | `requireOwner()` / `assertWritable()` → `ctx.supabase` | RLS limits everything to the owner's workspace; you can't get it wrong |
| A public page | `src/lib/site/public-data.ts` (anon key → `public_*` SQL functions) | Anon has no table access; the functions return explicit public columns only |
| Token pages, super admin, background work | `createAdminClient()` (service role) | Bypasses RLS: **scope every query yourself** in the same function, and validate any stored storage path with `isSafeStoragePath()` |

Default to the first. Needing the service role for an owner feature usually means a missing RLS policy.

---

## Recipe: an owner screen with a mutation

```
src/app/admin/things/
  page.tsx        server component: const { supabase, readOnly } = await requireOwner();
  actions.ts      "use server" mutations
  thing-form.tsx  client component using useActionState
```

```ts
// actions.ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertWritable } from "@/lib/auth";

const schema = z.object({ name: z.string().trim().min(1).max(120) });

export async function createThingAction(_prev: { error?: string }, formData: FormData) {
  const ctx = await assertWritable();            // 1. auth first, always (read-only when suspended)
  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await ctx.supabase           // 2. the user's client: RLS does the scoping
    .from("things")
    .insert({ workspace_id: ctx.workspace.id, ...parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/admin/things");
  return {};
}
```

- Server actions are public HTTP endpoints. Treat every argument, including ids, as attacker-controlled. RLS makes a foreign id harmless, but validate shapes with Zod anyway.
- Add the page to the sidebar in `src/app/admin/layout.tsx`.
- If the change can affect public output, call `revalidateSite(ctx.workspace.id)` from `src/lib/site/cache.ts`.

---

## Recipe: a new business table

Create a **new** migration: `npx supabase migration new things`. Never edit an applied migration.

```sql
create table public.things (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  client_id uuid,
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  -- Composite FK: a thing can only point at a client in the SAME workspace.
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
create index on public.things (workspace_id);

alter table public.things enable row level security;
create policy "ws read"   on public.things for select to authenticated using (public.is_member(workspace_id));
create policy "ws insert" on public.things for insert to authenticated with check (public.can_write(workspace_id));
create policy "ws update" on public.things for update to authenticated using (public.can_write(workspace_id)) with check (public.can_write(workspace_id));
create policy "ws delete" on public.things for delete to authenticated using (public.can_write(workspace_id));
revoke all on public.things from anon;

create trigger t_things_updated before update on public.things
  for each row execute function public.set_updated_at();
create trigger t_things_ws_immutable before update on public.things
  for each row execute function public.forbid_workspace_change();
```

Then:
1. Add `"things"` to `BUSINESS_TABLES` in `tests/helpers.ts` and a fixture row in `createTenant()`. The isolation suite then attacks it automatically.
2. Add it to `EXPORT_TABLES` in `src/lib/export.ts`, so owners' full exports include it.
3. If client deletion ("right to be forgotten") should remove it, the `on delete cascade` above handles that.
4. Apply the migration locally with `npm run db:reset`, then run `npm run test:db`.

---

## Recipe: show a new field on public pages

Public pages never query tables. To publish a new testimonial field:

1. **SQL:** in a new migration, `create or replace` the relevant `public_*` function
   (`public_testimonials`, `public_site`, `public_widget` …) to return the column. Only return fields that
   are safe for anyone to see, and only for published items in active workspaces. The existing
   functions show the filters.
2. **Types:** add it to `PublicTestimonial` in `src/lib/site/types.ts` and map it in `public-data.ts`.
3. **Render:** in `src/components/site/public-site.tsx`. React escapes text. Links built from stored URLs must go through `safeHref()`.
4. **Test:** extend the column allow-list and the "no private data" assertions in `tests/phase3.test.ts`.

**Never add owner-supplied HTML or JavaScript to public pages.** They share an origin, and the session
cookie, with the dashboard. A script there would act as any signed-in owner who views the page.
Analytics is limited to provider ids for this reason, and custom CSS is validated.

---

## Recipe: store and serve files

- **Upload** with `storeImage()` from `src/lib/uploads.ts`. It re-encodes images with sharp, strips EXIF,
  and stores them at `{workspace_id}/{folder}/{random}.webp`. Other files go under the same
  `{workspace_id}/…` prefix, with a random name.
- **Owner access:** `signPaths(ctx.supabase, paths)` issues signed URLs. The owner's session means storage policies apply.
- **Public access:** add a kind to `public_media_path()` or `public_brand_path()` and serve it through
  `src/app/api/public/media/…`. The route streams only paths the database approves.
- **Any path read from the database is untrusted.** Before a service-role read, sign or delete, check it
  with `isSafeStoragePath(path, prefix)` from `src/lib/storage-path.ts`. A plain `startsWith` check is not
  enough: storage clients resolve `..`, so `{mine}/../{theirs}/x` would reach another workspace. The SQL
  equivalent is `public.is_workspace_path(path, workspace_id)`.

---

## Recipe: a new form item type or per-item setting

The client form renders only from the request's frozen **template snapshot**
(`requests.template_snapshot`). That's what keeps in-flight requests stable when a template changes.

- **New item type:**
  - add it to `ItemType` and the type lists in `src/lib/form/types.ts`
  - add its label in `catalog.ts`
  - add its validation in `steps.ts` → `itemSchema`
  - add its input in `src/app/t/[token]/form-flow.tsx`
- **New per-item setting:** extend `ItemSettings`, `resolveSettings` (in `settings.ts`) and `buildSnapshot` (in `snapshot.ts`), and add a column to `src/components/item-settings-grid.tsx`.
- **Previews:** always render the real `FormFlow` with `preview`, never a copy.
- **Snapshots are versioned** (`TemplateSnapshot.version`). Keep old versions readable.

---

## Recipe: a widget layout or image card design

- **Widget layout:**
  - add the id to `WIDGET_LAYOUTS` in `src/lib/widget/config.ts`
  - render it in `src/components/site/widget-view.tsx`
  - give it an `initialHeight`, so the host page doesn't jump while it loads
- **Image card design:** add a key to `CARD_DESIGNS` and a colour scheme in `src/lib/cards/image-card.tsx`. Satori supports flexbox layout only.

---

## Recipe: consent rules

Consent is enforced twice, and the two must agree:
- in SQL: `public.consent_violation()` and the `enforce_testimonial_rules` trigger, which is authoritative
- in TypeScript: `src/lib/consent.ts`, which gives friendly messages in the UI

Change both in the same pull request, with a test in `phase2.test.ts`.

---

## Checklist for a pull request

- [ ] Owner mutations start with `assertWritable()` and use `ctx.supabase`
- [ ] Any service-role query is scoped in the same function, and stored paths pass `isSafeStoragePath()`
- [ ] New tables have RLS, composite FKs, the immutability trigger, and are in `BUSINESS_TABLES` and `EXPORT_TABLES`
- [ ] Public output goes through a `public_*` function and the phase 3 privacy test covers it
- [ ] No owner- or client-supplied HTML, JS or URLs rendered unsafely
- [ ] `npm run lint && npm run typecheck && npm test` pass
