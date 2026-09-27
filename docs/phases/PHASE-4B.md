# Phase 4b — Widget, image cards, CSV and export, custom CSS

| | |
| --- | --- |
| **Status** | Built and tested. Dashboard screens still need a click-through while signed in (see §5) |
| **Completed** | 27 Sep 2026 |
| **Commits** | `65cf300` widget + custom CSS · `6101a92` image cards, CSV, full export · `c71e39d` loader fix + tests · docs |
| **Brief sections** | §5.3 widget, §5.4 image cards, §4.2 CSV, §4.7 data export, §6 custom CSS, §9 Phase 4, §10.6 public key |
| **Database** | Migration `20261002000001_phase4b_widgets.sql` (one read-only function), applied to Supabase Cloud |

---

## 1. Acceptance checks (brief §9 Phase 4)

| Check | Status | Verified by |
| --- | --- | --- |
| Widget snippet renders correctly on a plain HTML page | ✅ | Browser: a plain HTML page on another origin (`127.0.0.1:8081`) with hostile styles embedded all 5 layouts with the script snippet, plus one with the iframe snippet. Each frame resized to fit, and the host styles didn't leak in |
| Widget snippet renders on a WordPress site | Waived | The owner confirmed on 27 Sep 2026 that a WordPress check isn't needed. In WordPress, the snippet goes in a "Custom HTML" block, which outputs the same markup as the plain page tested above |
| Image cards export at all three preset sizes | ✅ | `phase4b.test.ts` renders each size and checks the PNG header dimensions: 1080×1080, 1200×627, 1080×1920. All 3 designs are rendered too |
| Full data export includes all tables and media links | ✅ | `phase4b.test.ts`: all 19 business tables are present, every row belongs to the owner's workspace, request tokens are excluded, and media is listed for the owner's folder only |

---

## 2. What was built

### 2.1 Embeddable widget (`/admin/widgets`)

- **Builder options:**
  - 5 layouts: grid, carousel, single card, scrolling wall and rating badge.
  - Source: all published, featured, one tag, or a collection.
  - Max items (1–50) and columns (1–4).
  - Theme: same as the site, light, dark, or auto.
  - Show or hide photos and logos, ratings, dates, company and video.
  - A "See all testimonials" link to the wall.
- **Live preview:** the real widget renders in an iframe at desktop, tablet or mobile width, using the unsaved settings. The preview route is signed-in only and shows published testimonials only.
- **Snippets:**
  - Script (recommended): `<div data-testimonial-widget="{publicKey}/{widgetId}">` plus `/widget.js`. The loader creates a lazy iframe, reserves an initial height to avoid layout shift, and resizes it from `postMessage` height reports. It accepts messages only from the app's origin and from its own frame.
  - iframe: a fixed height, for sites that don't allow scripts.
- **Identifiers (§10.6):** snippets carry the workspace **public key**, never the workspace id.
- **Public data path:** the embed page `/embed/{key}/{id}` gets its data through the anon `public_widget(key, id)` function plus the Phase 3 public API. That means published testimonials only, within consent. A suspended workspace shows a neutral message.
- **Framing:** `/embed/*` sends `Content-Security-Policy: frame-ancestors *`. Every other route keeps `X-Frame-Options: SAMEORIGIN`.
- **Caching:** configs are cached per widget and invalidated on save. The site data follows the Phase 3 cache, which is invalidated on publish.

### 2.2 Image cards

- **Where:** the review page and the manual testimonial page have an **Image card** panel. You pick a size (square, landscape or story) and a design (classic, bold or minimal), see a preview, then download a PNG.
- **Look:** the card uses the site's palette and heading/body fonts. The fonts are TTF files fetched from Google Fonts and cached; if that fetch fails, the default font is used. Photos are converted to PNG, because the image renderer can't read WebP.
- **Consent:** an image card counts as public output, so it uses only the display fields. It is **refused** for Private consent, or when the fields go beyond the client's consent, using the same check as publishing.

### 2.3 CSV and export

- **Clients → Export CSV:** every client with all profile fields, tags and custom fields. Cells that a spreadsheet would treat as formulas (`=`, `+`, `-`, `@`) get a leading apostrophe, to prevent CSV injection.
- **Clients → Import CSV:** upload a file, then **Check file**, which is a dry run showing:
  - rows ready to import
  - rows skipped as duplicates (the email matches an existing client, or another row in the same file)
  - rows with problems, listed with row numbers
  - columns that weren't recognised

  Then **Import**. The server re-reads and re-validates the file rather than trusting the preview. Missing tags are created. Duplicates are skipped, never merged. Limits: 2 MB and 2,000 rows. An exported file imports cleanly (tested round trip).
- **Settings → Data:**
  - **Download data (ZIP):** `data.json`, one CSV per table, and `media.csv` listing every file with a 7-day download link, plus a README.
  - **Download all media (ZIP):** streamed file by file.
  - Both read with the owner's session, so row-level security limits them to one workspace.
  - Request tokens and approval token hashes are left out, because they work like passwords.

### 2.4 Custom CSS (Appearance → Theme → Custom CSS)

- **Scope:** applied last, and only on the public wall, collection and single-testimonial pages. It is nested under `.tc-site`, so it can't restyle anything else. It is not applied to the widget or the client form.
- **Hooks for styling:** `.tc-card` (each testimonial card) and `.tc-quote` (its text).
- **What gets refused:** `<`, `@import`, backslash escapes, `expression()`, `javascript:` and similar, `url()` that isn't `https:` or `data:image/`, and unbalanced braces. It is checked on save and again when the page renders. The live preview uses it too, and it is saved in theme history.

---

## 3. Tests

`tests/phase4b.test.ts` has 34 tests. The full suite has **231 passing**, run against Supabase Cloud.

- **Widget:**
  - Config fallbacks and source selection, including collection order and max items.
  - Snippets carry the public key only.
  - `public_widget` returns a widget only for the right key, with only published collection items, and nothing for another workspace's key.
  - Anon users can't read the table; another owner can't read or edit the widget.
  - A suspended workspace exposes only its status.
  - HTTP: the embed page is frameable and leaks nothing private; the rest of the app is `SAMEORIGIN`; the loader parses as valid JavaScript; bad keys return 404.
- **Custom CSS:** valid CSS is scoped; 7 attack patterns are rejected.
- **CSV:** quotes, embedded newlines, CRLF and BOM; formula neutralising; import validation with row numbers; duplicate detection; custom fields; export → import round trip.
- **Export:** all tables present, one workspace only, no tokens; storage listing is limited to the owner's folder.
- **Image cards:** all 3 sizes at exact dimensions and all 3 designs.

---

## 4. Bug found during verification

The first version of `widget.js` was served with a broken regex. The escaped `\/` was lost inside a template string, so the whole script failed to parse and nothing mounted. It was caught on the plain HTML host page and fixed by using `[/]`. A test now parses the served script.

---

## 5. Not yet verified in the browser

The dashboard screens haven't been clicked through in the browser:
- widget builder
- image card panel
- CSV import
- Data page
- Custom CSS field

Signing in would have meant typing a password that goes to the real Supabase Cloud project. The logic behind each screen is covered by the tests above.

To finish these checks, sign in yourself in the browser pane and let the agent drive the session.
