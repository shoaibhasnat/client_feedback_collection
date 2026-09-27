# Phase 3 — Showcase

| | |
| --- | --- |
| **Status** | ✅ Complete — all acceptance criteria met and verified |
| **Completed** | 29 Sep 2026 |
| **Commits** | `5a55962` public API & public pages · `edd54be` collections, appearance editor, themed form, tests · `22c03a0` self-hosted fonts (performance) · docs |
| **Brief sections** | §9 Phase 3, §5.1–5.2, §6, §8 (public data, performance), §10.2 (public routes), §10.5 (suspension), §10.6 (slug URLs) |
| **Builds on** | [Phase 1](phase-1.md) · [Phase 2](phase-2.md) · [App guide](../architecture.md) |

---

## 1. Goal

Turn published testimonials into public pages that win work — a themed wall, tag-filtered links for
proposals, hand-picked collections and shareable single-testimonial pages — that each owner can restyle
without code, while guaranteeing no private data ever reaches a public page.

**Scope from the brief:** public wall page, theme and appearance editor, filtered links, collections,
single-testimonial pages, SEO.

---

## 2. Acceptance criteria

| # | Criterion (brief §9) | Status | How it is met | Verified by |
| --- | --- | --- | --- | --- |
| 1 | Owner can change colours, fonts, logo, section order and copy, and see it live without code | ✅ | `Site & Settings → Appearance`: presets, palettes, fonts, shape, section drag-and-drop, all copy, branding uploads; live preview renders the real public components | Browser: Warm preset + custom primary + hero/CTA copy + About shown and reordered → preview updated instantly → saved → `/acme-studio` showed every change immediately |
| 2 | `/love?tag=x` and collection URLs show the correct testimonials | ✅ | `/{slug}?tag=` (tag name, slug or id), search `?q=`; `/{slug}/c/{collection}` in the owner's order; unknown tag → no results; hidden items never listed | `phase3.test.ts` HTTP tests; browser: created “E-commerce stores” collection → public URL showed exactly its two testimonials |
| 3 | No private field appears in any public page source or API response (verified by test) | ✅ | Public pages read only through anon-callable `SECURITY DEFINER` SQL functions returning explicit public columns; media served only for DB-approved paths | `phase3.test.ts`: planted email, phone, note, budget, raw answer, hidden/private quotes → asserted absent from every public RPC response and from the HTML (incl. RSC payload) of wall, collection and single pages |
| 4 | Lighthouse mobile score of 90+ on the wall page | ✅ | Self-hosted curated fonts (`next/font`), `next/image` AVIF/WebP, lazy images, cached data | Lighthouse 12, mobile, production build: **Performance 96 / 94** (two runs), Accessibility 100, Best Practices 100, SEO 100; FCP 0.9–1.4 s, CLS 0.002 |

> The brief uses `/love` in §5.1 but `app.com/{slug}` in §10.6 (multi-tenant). The wall lives at `/{slug}`.

---

## 3. What was built

### 3.1 Public read API (migration `20260929000001_phase3_public_api.sql`)

The anon role still has **no table access**. Public pages call these functions with the anon key:

| Function | Returns |
| --- | --- |
| `public_workspace(slug)` | id, name, slug, status (never deleted workspaces) |
| `public_site(workspace)` | public profile fields, theme/layout/SEO — storage paths replaced by `has_*` flags; null unless active |
| `public_testimonials(workspace)` | published testimonials with non-empty quote: quote, headline, name, role, company, rating, date, platform, `has_photo`/`has_logo`, featured, order, tag ids, version |
| `public_tags(workspace)` | tags used by published testimonials |
| `public_collection(workspace, slug)` | collection with its **published** testimonial ids in order |
| `public_media_path(testimonial, kind)` | storage path for a published testimonial's photo/logo in its own workspace, else null |
| `public_brand_path(workspace, kind)` | owner photo, logos, favicon, OG image path for an active workspace, else null |

Consent is already enforced when publishing (Phase 2 trigger), so anything these functions return is within
the client's consent.

### 3.2 Public pages

| Route | Content |
| --- | --- |
| `/{slug}` | Header with logo; hero (photo, title, subtitle, stats "N testimonials · 4.9 average", CTA); featured (up to 3); all testimonials in grid or masonry with tag chips + search (state in the URL); about; services; client logos; CTA footer — in the owner's order and visibility |
| `/{slug}?tag=shopify` / `?q=` | Filtered view; unknown tags show nothing; JSON-LD follows the filter |
| `/{slug}/c/{collection}` | Collection name, intro text, its published testimonials in order |
| `/{slug}/t/view/{id}` | One testimonial, large, with its own Open Graph card |
| Suspended workspace | Neutral "Temporarily unavailable" on every public route (§10.5) |
| Unknown / deleted slug | 404 |

Cards show headline, rating, quote, photo, name, role/company, logo, platform badge (Upwork / Referral / Direct)
and date — each toggleable, always limited by consent.

### 3.3 Media, images and Open Graph

- **Media routes** `/api/public/media/{id}/{version}/{photo|logo}` and `/api/public/brand/{workspace}/{version}/{kind}` stream from the private bucket only after the database approves the path; unpublishing takes effect within the 5-minute cache. Responses carry `nosniff` and a sandboxing CSP.
- **Images** go through `next/image` (AVIF/WebP, resized, lazy, fixed dimensions → CLS 0.002).
- **Open Graph** cards generated with `next/og` in the site's colours: `/api/public/og/{slug}` (name, tagline, a quote, rating) and `/api/public/og/{slug}/t/{id}` (the testimonial). An uploaded share image overrides the site card.

### 3.4 SEO

Per-page title, description, canonical URL, Open Graph + Twitter tags, favicon, `index/follow` (or `noindex`
if the owner opts out), and `Organization` JSON-LD with `AggregateRating` and `Review` entries (escaped so
it can't break out of its `<script>`).

### 3.5 Appearance editor (`Site & Settings → Appearance`)

| Tab | Controls |
| --- | --- |
| Theme | 5 presets (Minimal, Bold, Dark, Warm, Editorial); mode light / dark / follow system; light and dark palettes (primary, accent, background, surface, text, muted, border); heading/body font from 14 curated fonts; base size; corners; card style; spacing |
| Layout | Drag-and-drop section order + visibility (hero, featured, grid, about, services, logos, CTA); grid or masonry; 2–4 columns; fields shown on cards |
| Content | Hero title/subtitle, stats toggle, CTA text/link, every section title, about text, search placeholder, empty state, footer |
| Branding | Site name; logo (light), logo (dark), favicon, social share image, client-form background — uploaded, re-encoded and saved immediately |
| SEO | Title, description, noindex, analytics (Plausible domain or GA4 measurement ID only) |
| History | Last 10 saved versions of theme + layout with restore |

Live preview (mobile/desktop) renders the same components as the public site, with real published
testimonials or samples. Unsaved changes are flagged; *Discard* reverts.

### 3.6 Collections (`/admin/collections`)

Create, rename, change address, intro text, add/remove testimonials, drag-and-drop order, copy/open link,
delete. Unpublished items can be added but are flagged and never shown publicly.

### 3.7 Client form uses the site theme

The token form now follows the site's palette (dark mode respected), heading and body fonts, and optional
background image (with a readable panel), in the live form and all dashboard previews.

### 3.8 Caching and invalidation

Public data is cached per workspace (`unstable_cache`, tag `public-site:{workspace}`, 5-minute fallback)
and invalidated with `revalidateTag(…, { expire: 0 })` by every owner action that can change public output
(testimonial save/bulk/delete, tags, collections, appearance, profile, projects, client deletion), by token
form submissions (consent changes), and by super-admin slug/status changes.

---

## 4. Security decisions

| Decision | Reason |
| --- | --- |
| Public reads via anon + `SECURITY DEFINER` functions, not the service role | Brief §8 ("views or API routes that return published, consent-limited fields"). Page code physically can't select private columns. |
| Media streamed through a route that asks the DB for the path | No public copies to clean up; unpublishing / consent withdrawal removes access (within the cache window). The route can't be pointed at arbitrary objects. |
| No raw custom `<head>` snippet; analytics by provider + validated ID | All workspaces share one origin; arbitrary script would run in other owners' and the super admin's sessions. |
| Custom CSS not implemented | It is Phase 4 in the brief; it must stay scoped/sanitised for the same reason. |
| Theme CSS built only from validated hex colours, enums and self-hosted font stacks | The inline `<style>` can't be broken out of. |
| Branding asset paths never accepted from the browser | Uploads/removals go through dedicated actions; the save action keeps stored paths. |
| `limitInputPixels` on all image processing | Protects against decompression-bomb uploads. |
| Fonts self-hosted | Performance, and no third-party request carrying visitor IPs to Google. |

---

## 5. Out of scope (deferred)

| Item | Phase |
| --- | --- |
| Video testimonials in featured section / lightbox | 4 (video) |
| Embeddable widget, image-card export, collection PDF | 4 |
| Custom CSS (scoped) | 4 |
| Custom domains | Not in v1 |

---

## 6. Verification

### Automated — 176 tests, all passing

| File | Tests | Covers |
| --- | --- | --- |
| `tests/phase3.test.ts` | 14 | anon table access still blocked; public columns only; published only; no cross-workspace mixing; no private values in site/testimonials/tags/collection RPCs; collections exclude unpublished; media paths only for published items in their workspace; suspended workspace exposes only status; HTTP: wall/collection/single pages contain no private values, `?tag=` by name/slug/id, unknown tag, search, collection exactness and 404s, cross-workspace single page 404, media 404 for hidden, OG images render |
| `tests/site-config.test.ts` | 12 | defaults, per-field fallback of invalid values, CSS can't escape `<style>`, system dark mode, presets keep branding, font stacks, section normalisation, unsafe CTA links rejected, analytics ID formats, tag resolution, filtering, escaped JSON-LD |
| Earlier suites | 150 | Phases 1–2 unchanged and passing |

HTTP tests run against the dev server when it is up and are skipped otherwise.

### Manual (29 Sep 2026)

1. Public wall rendered with theme, stats, tag chips, search and masonry cards; `?tag`, unknown slug (404), OG images (PNG) checked.
2. Appearance: Warm preset, custom primary, hero title, CTA, About section shown and reordered (mouse and keyboard) → preview updated live → saved → public page updated immediately (background, primary, Fraunces headings, copy, section order, JSON-LD, OG tag, `index, follow`).
3. Collection "E-commerce stores" created with intro and two testimonials → public URL showed exactly those, in order.
4. Request preview and client form showed the site theme (palette + Nunito/Fraunces).
5. Lighthouse (mobile, production build): 96 / 100 / 100 / 100.

### Issues found and fixed during Phase 3

| Issue | Fix |
| --- | --- |
| Lighthouse Performance 87: Google Fonts CSS render-blocking | Self-hosted fonts via `next/font` → 94–96 |
| `?tag=` view's JSON-LD still listed all testimonials | JSON-LD built from the filtered list |
| Editor: changing a colour right after a preset could merge into the stale palette | Functional state update |
| Duplicate React keys in preset swatches (same colour twice) | Keyed by position |
| Preview search could navigate the dashboard | Inert search wrapper in preview mode |
| Preview images on a non-configured host broke `next/image` | Helper uses `next/image` for own routes, plain `<img>` otherwise |
| Image uploads over the pixel limit threw a generic error | Dimension check + friendly error |

---

## 7. Known limitations

- Public data may be up to 5 minutes stale when changed by a database trigger outside an owner action (e.g. consent withdrawal via the token form is revalidated; other trigger paths rely on the TTL).
- The optimized image cache (`minimumCacheTTL` 300 s) means an unpublished photo can remain cached for up to 5 minutes.
- Only one slug-level wall per workspace; no custom domains (by design).
- The dashboard's own UI fonts (Geist) still load on public pages via the root layout; the score is above target, but splitting layouts would shave a little more.

---

## 8. Handover to Phase 4

- `PublicSite` / `public_*` functions and the card components are reusable for the **embeddable widget** (use the workspace `public_key`, not the internal id) and **image cards** (`lib/site/og.tsx` already renders cards with `next/og`).
- Video: add `video_url`/thumbnail to `public_testimonials` and a lightbox in the featured section.
- Custom CSS: must be scoped to `.tc-site` and sanitised (no `@import`, `url()` to other origins, or `</style>`).
