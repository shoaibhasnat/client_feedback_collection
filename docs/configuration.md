# Configuration

## Environment variables

| Variable | Needed by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app, scripts, tests | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | app, tests | Public anon key. All access is still governed by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | app (server only), scripts, tests | Bypasses RLS. Used only in server code that scopes each query itself. **Never** prefix it with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | app, tests | Public base URL, used in request, invite, approval and widget links |
| `IP_HASH_SALT` | app | Salt for hashing IP addresses. Raw IPs are never stored |
| `NEXT_PUBLIC_VIDEO_MAX_MB` | app | Largest video upload in MB (5–100, default 50). Keep it at or below your storage plan's per-file limit and the bucket limit |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | `seed:admin` | Super admin bootstrap. The password needs at least 12 characters |
| `DEMO_OWNER_EMAIL`, `DEMO_OWNER_PASSWORD` | `seed:demo` | Optional. Without a password, a random one is generated and printed |

## Supabase settings (`supabase/config.toml`)

| Setting | Value | Why |
| --- | --- | --- |
| `[auth] enable_signup` | `false` | Accounts are created only through invites or the seed scripts |
| `[auth.email] enable_signup` | `true` | Despite the name, this enables email and password **login**. Turning it off breaks sign-in |
| `[auth.email] enable_confirmations` | `false` | Invited users are created already confirmed |
| `[auth] minimum_password_length` | `8` | Matches the app's own checks |
| `[auth] additional_redirect_urls` | `localhost:3000` | Password reset links land on `/auth/confirm`. Add your production URL when you deploy |
| `[storage] file_size_limit` | `50MiB` | The Supabase free-plan cap. The `uploads` bucket has its own limit set by migration |

Apply them to a hosted project with `npx supabase config push`, reviewing the diff first.

## App settings (`next.config.ts`)

- **Server Action body limit: 18 MB.** Image uploads go through Server Actions, and images are re-encoded on the server.
- **Security headers:**
  - `nosniff` and a strict referrer policy everywhere.
  - `X-Frame-Options: SAMEORIGIN` on every route except `/embed/*`, which any site may frame.
  - Token pages (`/t`, `/a`, `/invite`) add `no-referrer`, `noindex` and `no-store`.
- **Images:** AVIF and WebP formats for public media.

## Per-workspace settings

Everything else is configured per workspace in the dashboard, not through environment variables:
- form templates
- message templates
- custom fields
- tags
- appearance (theme, layout, custom CSS)
- SEO and analytics (Plausible or GA4 ids)
- widgets
