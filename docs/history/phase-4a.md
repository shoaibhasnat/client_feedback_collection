# Phase 4a — Video, approval, reminders

| | |
| --- | --- |
| **Status** | ✅ Complete: all scoped items built and verified |
| **Completed** | 27 Sep 2026 |
| **Commits** | `a7d3292` video step on the client form · `742aea6` owner video review + client approval links · `e27a11c` wall video, reminder polish, approvals on Home · `51d294b` tests · docs |
| **Brief sections** | §3.4 (video), §4.4 (client approval), §4.2 (reminders), §9 Phase 4 |
| **Builds on** | [Phase 1](phase-1.md) · [Phase 2](phase-2.md) · [Phase 3](phase-3.md) · [App guide](../architecture.md) |

---

## 1. Goal and split

The brief's Phase 4 ("Extras") was split in two to keep each delivery reviewable:

| Part | Scope |
| --- | --- |
| **4a (this document)** | Video record/upload on the client form · owner review with **video download** (dashboard only) · video on the public wall with a lightbox · client approval of edited quotes · reminders polish |
| **4b (next)** | Embeddable widget · image cards · CSV import/export plus full data export · custom CSS |
| **Still to schedule** | Workspace deletion with a 30-day purge · super admin per-workspace export · TOTP 2FA · custom head snippet |

"Download video" was added to the Phase 4 list at the owner's request. It is available only in the
dashboard and never on public pages.

---

## 2. Acceptance checks

| # | Check | Status | Verified by |
| --- | --- | --- | --- |
| 1 | A client can record in the browser or upload a video, and it survives leaving and resuming | ✅ | Browser: a generated 3-second WebM went through the upload path (progress, then attached with a captured thumbnail). A reload resumed the draft with the video in place |
| 2 | Video can only be published with Full consent; withdrawing consent unpublishes it | ✅ | `phase4a.test.ts` (database trigger, not just the UI) |
| 3 | Owner can play and download the video, with a readable filename | ✅ | Browser: the review page player loaded; the download link returned `Content-Disposition: attachment; filename=jordan-blake-testimonial-2026-09-27.webm` |
| 4 | Published video appears on the wall and plays in a lightbox; nothing private leaks | ✅ | Browser: the video card sorted first, played via a signed redirect, and Escape closed and unmounted the player. Tests check the media route (302 only while published, 404 when hidden) and that public rows carry no storage paths |
| 5 | The owner can ask the client to approve an edited quote; the client can approve or suggest changes | ✅ | Browser: full loop (see §4) |
| 6 | Editing an approved or pending quote voids the approval | ✅ | Browser: after an edit the old link showed "Link not found" and the status reset |
| 7 | "Needs a reminder" list counts from the last reminder, and copying the reminder records it | ✅ | `phase4a.test.ts` (filter semantics); the Requests filter loads |

---

## 3. What was built

### 3.1 Database (migration `20260930000001_phase4a_video_approval.sql`)

- **Bucket:** 100 MB per object, and accepts `video/webm`, `video/mp4` and `video/quicktime` alongside images. `config.toml` raises the global storage limit to 100 MiB; restart Supabase after pulling.
- **New `testimonials` columns:**
  - Video: `video_thumbnail_url`.
  - Approval: `approval_token_hash` (unique; the raw token is never stored), `approval_requested_at`, `approval_responded_at`, `approval_quote` (the exact wording sent) and `approval_comment`.
- **`enforce_testimonial_rules`:** `video_url` and `video_thumbnail_url` must point to files in the testimonial's own workspace. A published video requires Full consent.
- **`sync_testimonial_consent`:** also unpublishes a video testimonial if consent drops below Full.
- **Public API:**
  - `public_testimonials` adds `has_video` and `has_video_thumb` and sorts featured first, then video.
  - `public_media_path` serves the kinds `video` and `video_thumb`.

### 3.2 Client form: video step

- **Enabling it:** the builder has **Video step** settings: on/off, required, max length 15–300 s (default 90) and max size 5–100 MB. The per-request settings grid has a **Video** row (shown/hidden, required/optional).
- **Placement:** the step comes after the questions. While recording, the questions are shown as prompts.
- **Recording:**
  - Uses MediaRecorder at 2 Mbps (about 22 MB for 90 s), preferring MP4 where the browser supports it.
  - A 3-2-1 countdown, then a timer that stops automatically at the limit.
  - The client can re-record or remove it.
- **Uploading a file:** type, size and duration are checked in the browser and again on the server.
- **Background upload:**
  1. `startVideoUpload` validates and returns a signed upload URL for `{ws}/submissions/{id}/video-*.ext`.
  2. The browser PUTs the file straight to storage, showing progress.
  3. `finishVideoUpload` checks that the object exists, its size and its `video/*` type. It then stores a 640 px WebP thumbnail captured in the browser and attaches both to the submission.

  The client keeps going with the form while this runs. Submit waits for an unfinished upload.
- **At submit:** the server reads the video path from the database, never from the browser.

### 3.3 Owner review

- **Video panel:**
  - Player and a **Download video** button: a signed URL with `download=`, named `{client}-testimonial-{date}.{ext}`.
  - **Show video on the wall** toggle, which is disabled unless consent is Full.
  - An optional custom thumbnail upload, re-encoded like other images.
- **Client approval card:**
  - It flags when the quote isn't word-for-word from the client's answers (`isVerbatimQuote`).
  - **Ask client to approve** creates a 192-bit token and stores only its SHA-256 hash.
  - The link and a ready-made message are shown **once**, with copy buttons. Asking again replaces the link, and a pending request can be cancelled.
- **Home:** a **Client approvals** card lists pending requests and suggested changes.

### 3.4 Client approval page `/a/{token}`

- **What the client sees:** the exact wording sent and their byline, styled with the owner's theme colour. They can **Approve**, or **Suggest changes** with a comment of up to 2000 characters.
- **Protections:**
  - Headers: `no-referrer`, `noindex` and `no-store`.
  - Rate limits: per IP, and per token for responses.
  - Links expire after 30 days.
  - An answer counts only if the stored hash still matches and the status is still pending, so replaced or cancelled links can't respond.
- **Logging:** every response is written to the activity log. The slug `a` is reserved so no workspace can take it.

### 3.5 Public wall

- **Card:** if a testimonial has a video, its card shows the thumbnail and a play button (a new **video** card field, on by default).
- **Player:** clicking opens a native modal `<dialog>`, which traps focus and closes on Escape or a backdrop click. The video loads only when opened.
- **Media route for video:** `/api/public/media/{id}/{v}/video` re-checks publication, then answers with a **302 to a 10-minute signed URL** (`no-store`). Seeking and range requests go straight to storage, and unpublishing stops new plays immediately.
- **Thumbnails** are streamed like photos.

### 3.6 Reminders

- **Auto-record:** copying the Reminder message on a request records `last_reminded_at`, once per page view.
- **New filter:** Requests has **Needs a reminder**: sent, not revoked, and nothing heard for *N* days (the setting in Message templates). It counts from the last reminder if there was one, otherwise from when the link was sent.
- **Home:** the stale list uses the same rule and links to the filter.

---

## 4. Browser walkthrough (27 Sep 2026)

1. Turned on the video step in the Standard template, then created a request for Jordan Blake.
2. Client form: answered the questions and reached the video step. A generated WebM was uploaded; the video and thumbnail attached to the submission.
3. First submit was silently discarded. This was expected: a test script had typed into the hidden honeypot field, so the app treated it as a bot. After a reload the draft resumed on the consent step. Chose Full and submitted.
4. Review: player worked and the download filename was correct. Wrote a reworded quote, ticked "Show video on the wall" and published. The card flagged "differs from the client's own wording".
5. Wall: the video card came first; the lightbox played the video and Escape closed it.
6. Created an approval link and used Suggest changes as the client. Home showed "Changes suggested" and the review page showed the comment.
7. Edited the quote: the approval reset and the old link returned "Link not found". Created a new link and approved it; the status became `approved` and three activity entries were logged.

---

## 5. Tests

`tests/phase4a.test.ts`: 20 tests. Full suite: **196 passing**.

- **Consent rules:** Full consent can publish video; dropping to Partial auto-hides it; Partial can't publish video; the same testimonial publishes fine without the video.
- **Path checks:** cross-workspace video and thumbnail paths are rejected; owners can't rewrite the submitted video.
- **Public API:** `public_media_path` returns video paths only while published; public rows expose `has_video` but never paths.
- **Storage:** signed video upload works; disallowed types (`text/html`) are refused.
- **Form engine:** video step placement and required validation.
- **Approval helpers:** verbatim detection and download filename.
- **Reminders:** the reminder filter's semantics against PostgREST.
- **HTTP:**
  - Approval page: shows the quote with noindex/no-referrer headers and no private data; unknown or malformed tokens are rejected; expiry works.
  - Media route: 302 to a signed URL while published, 404 when hidden, 404 for unknown kinds.

---

## 6. Known limits and deviations

| Item | Note |
| --- | --- |
| Resumable uploads | Uploads use signed single-request PUTs instead of tus. A dropped connection means re-uploading; the error says so and keeps the recording in the browser. Fine up to the 100 MB cap |
| Server-side compression | Not done. In-browser recording targets about 22 MB at 2 Mbps; uploaded files are stored as-is within the size limit |
| Real devices | Recording was exercised with a synthetic stream. **Check camera and mic recording on real iOS Safari and Android Chrome** before launch (iOS records MP4, which is supported) |
| Approval notification | The app sends no email (per the brief). The owner shares the approval link themselves, and responses appear on Home and on the review page |
