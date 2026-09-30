# Deploying Cairn

Cairn builds to a static site (`npm run build` → `dist/`) that talks to Supabase from the browser. Both Vercel and
Render are configured in the repo. Pick one.

The site needs exactly two environment variables, the same as in your `.env`:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's anon (public) key |

Anything prefixed `VITE_` is bundled into the public site. Never add `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_URL` to
a host: the site doesn't use them, and they'd bypass row-level security.

## Vercel (`vercel.json`)

1. On vercel.com: **Add New → Project**, import the GitHub repo. The settings come from `vercel.json`.
2. Under **Environment Variables**, add the two above.
3. **Deploy.** Every push to `main` redeploys.

## Render (`render.yaml`)

1. On render.com: **New → Blueprint**, pick the repo. It creates a static site named `cairn`.
2. Render asks for the two values marked `sync: false`. Paste them.
3. **Apply.** Every push to `main` redeploys.

## Then: let Supabase sign people in there

Sign-in links (magic link and Google) redirect back to the address the user signed in from, and Supabase only allows
addresses on its list. In the Supabase dashboard, **Authentication → URL Configuration**:

- **Site URL:** the deployed address, e.g. `https://cairn.vercel.app`.
- **Redirect URLs:** add `https://cairn.vercel.app/**` (and `http://localhost:5173/**` for local development, if it
  isn't there already).

`supabase/config.toml` doesn't affect the live project (see CLAUDE.md), so this has to be done in the dashboard.

## Both configs

- Every path that isn't a real file (`/g/<id>`, `/sign-in`, `/auth/callback`) serves `index.html`, so deep links and
  refreshes work.
- Hashed build assets are cached for a year. Island models are cached for a day.
- Node 22 (`engines` in `package.json`, `.node-version`).

## Trying it on a phone without deploying

Run `npm run dev -- --host` on your computer, open the **Network** address it prints on a phone on the same Wi-Fi,
and add that address (e.g. `http://192.168.1.23:5173/**`) to Supabase's Redirect URLs.
