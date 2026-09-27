# Getting started

This guide takes you from a fresh clone to a running app with a super admin, and optionally a demo
workspace. It covers local development with Docker and using a Supabase Cloud project instead.

## Requirements

- **Node.js 20.9+.** Node 22 LTS is recommended. On Node 20 the app supplies the `ws` package as the
  WebSocket implementation for supabase-js.
- **Docker Desktop**, running, for the local Supabase stack.
- The Supabase CLI is installed as a dev dependency, so run it with `npx supabase`.

## 1. Install

```bash
npm install
```

## 2. Start Supabase locally

```bash
npm run db:start
```

This starts Postgres, Auth, Storage and Mailpit in Docker and applies every file in
`supabase/migrations/`. The first run downloads the images and takes a few minutes.

Print the connection details:

```bash
npx supabase status
```

## 3. Configure the environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `API URL` from `supabase status` (usually `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon key` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role key`. **Server only; never expose it to the browser.** |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `IP_HASH_SALT` | Any long random string, e.g. `openssl rand -hex 32` |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Your first login (password of 12+ characters) |

All variables are described in [Configuration](configuration.md).

## 4. Create the super admin

```bash
npm run seed:admin
```

There is no sign-up page: the super admin creates workspaces and invites their owners. Re-running the
script resets the password to the value in `.env.local`.

## 5. (Optional) Load demo data

```bash
npm run seed:demo
```

This creates the workspace `demo` (public page at `/demo`) with an owner account, three clients, published
testimonials, a tag, a collection and a widget. It prints the owner's login. It only runs against a local
stack, unless you set `ALLOW_REMOTE_SEED=1`.

## 6. Run the app

```bash
npm run dev
```

Open <http://localhost:3000/login>:

- **As super admin**, go to `/superadmin`, create a workspace, and copy the invite link.
- **Open the invite in a private window** to set the owner's password. You land on the owner dashboard at `/admin`.
- **As the owner**, add a client, create a request, and open the request link in another window to fill in the form.

Auth emails, such as password resets, go to Mailpit at <http://127.0.0.1:54324> when running locally.

## Using Supabase Cloud instead of Docker

1. Create a project at [supabase.com](https://supabase.com).
2. Link it and apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF   # asks for the database password
   npx supabase db push --linked
   ```
3. Push the auth and storage settings. This includes public sign-up off and the 8-character password minimum:
   ```bash
   npx supabase config push
   ```
   The command shows a diff and asks before each section. Review it: `supabase/config.toml` also contains
   local-development values, and you may want to keep some cloud defaults. Examples are the email send
   frequency and the site URL.
4. Put the project URL and keys (Dashboard → Project Settings → API) in `.env.local`, then run `npm run seed:admin`.

> **Free plan:** Supabase caps uploads at 50 MB per file. The app defaults `NEXT_PUBLIC_VIDEO_MAX_MB` to 50
> and a migration sets the bucket limit to match. On a paid plan you can raise both to 100.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing environment variable NEXT_PUBLIC_SUPABASE_URL` | `.env.local` is missing or incomplete. Restart `npm run dev` after editing it |
| Sign-in says the email provider is disabled | In `supabase/config.toml`, `[auth.email] enable_signup` must stay `true`: it controls email login. Public sign-up is turned off by `[auth] enable_signup = false` |
| `WebSocket is not defined` on Node 20 | Use the clients from `src/lib/supabase/*`, which pass the `ws` transport, or upgrade to Node 22 |
| Docker containers won't start | Make sure Docker Desktop is running. Try `npm run db:stop` then `npm run db:start` |
| Images fail to upload | Check the file is JPG, PNG, WebP or GIF, under 8 MB and under 50 megapixels |
