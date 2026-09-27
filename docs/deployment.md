# Deployment

The reference setup is **Vercel** for the Next.js app and **Supabase Cloud** for the database, auth and
storage. Both have free tiers that work for small installations. Any Node host that runs `next start`
works in place of Vercel.

## 1. Supabase project

1. Create a project and note its **ref** (the id in the dashboard URL).
2. Apply the schema and settings from your machine:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --linked
   npx supabase config push          # review the diff; see docs/configuration.md
   ```
3. In **Authentication → URL Configuration**:
   - set **Site URL** to your production URL, e.g. `https://reviews.example.com`
   - add `https://reviews.example.com/auth/confirm` to the redirect URLs
4. In **Authentication → SMTP**, set up your own email provider before real use. The built-in sender is
   heavily rate-limited, and on the free plan it only delivers to your project's team members. The app
   sends auth emails (password reset) only.
5. Backups: hosted projects have daily backups. Owners can also download a full export from
   **Settings → Data**.

## 2. The app on Vercel

1. Import the repository. The repo's `vercel.json` sets the framework to Next.js. If a build fails with
   *No Output Directory named "public" found*, check **Settings → Build and Deployment → Framework Preset**
   is **Next.js**, and that Output Directory has no override.
2. Set these environment variables for Production and Preview (the app will not run without the Supabase ones):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (the production URL)
   - `IP_HASH_SALT` (a new random value)
   - optionally `NEXT_PUBLIC_VIDEO_MAX_MB`
3. Deploy.

## 3. First login

Create the super admin from your machine, with the production values in your environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD=… npm run seed:admin
```

Use a real email address, so password reset emails can reach you.

## Production checklist

- [ ] Public sign-up is off: `config push` done, or **Auth → Providers → Email → Allow new users to sign up** unchecked
- [ ] Site URL and redirect URLs point at production
- [ ] Custom SMTP is configured
- [ ] `IP_HASH_SALT` is a new random value, not the development one
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set only in server-side environment variables
- [ ] The super admin uses a strong, unique password. Two-factor login isn't built yet (see [CHANGELOG](../CHANGELOG.md))
- [ ] If you run several app instances, move rate limiting to a shared store (`src/lib/rate-limit.ts`)

## Upgrading

Migrations are append-only. After pulling a new version:

```bash
npx supabase db push --linked --dry-run   # see what will run
npx supabase db push --linked
```

Then redeploy the app. Read the [CHANGELOG](../CHANGELOG.md) for anything that needs manual steps.
