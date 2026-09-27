# Product Price Tracker (INE intern assignment)

Live: <frontend-vercel-url> · API: <render-backend-url> · Repo: https://github.com/MohitGoyal09/price-tracker

## Setup (local)
1. Supabase: run `supabase/schema.sql` in SQL editor. Requires `pgcrypto` for `gen_random_uuid` (enabled by default).
2. Backend (`backend/`):
   ```
   npm install
   npx playwright install chromium
   cp .env.example .env  # fill SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET
   npm start  # :4000
   ```
3. Frontend (`frontend/`):
   ```
   npm install
   npm run dev  # :5173, talks to localhost:4000 by default
   ```
4. Seed 2–3 tracked products from the dashboard search, then trigger `Scrape now`.

## Deploy
- Backend → Render: **Runtime Docker** (required — native builds run as non-root
  and can't `apt-get` Playwright's system deps). `backend/Dockerfile` uses the
  Playwright `v1.63.0-noble` image (exact Chromium + deps, pinned to the npm
  `playwright@1.63.0`). Dashboard: Runtime Docker, Dockerfile `./backend/Dockerfile`
  (or Blueprint via repo-root `render.yaml`). Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
  `CRON_SECRET`, `STORE_BASE_URL` in dashboard. Local dev still uses plain
  `npx playwright install chromium` (no `--with-deps` on macOS).
- Frontend → Vercel: import `frontend/` as project root (Vite auto-detected), set `VITE_API_URL` to the Render URL, deploy.
- Cron → cron-job.org every 2h: `GET https://<render-backend>/api/cron/scrape?secret=$CRON_SECRET`.
  Responds 202 instantly and scrapes in the background (a full run takes minutes);
  overlapping runs are skipped. Check dashboard history for new rows ~10 min after trigger.
- Keep-warm → second cron-job.org job every 10 min: `GET https://<render-backend>/api/health`.
  Render free sleeps after ~15 min idle; this keeps one instance warm (well within 750 h/month).
  The 2h scrape cron would cold-boot otherwise and burn its HTTP timeout on startup.

## Scraping schedule
- External cron (cron-job.org) every 2h: `GET https://<backend>/api/cron/scrape?secret=$CRON_SECRET`.
- No always-on loop (free tier sleeps). Manual `POST /api/scrape-now` for demos.

## Env vars (backend)
SUPABASE_URL, SUPABASE_SERVICE_KEY (server-only), CRON_SECRET, STORE_BASE_URL=https://demo.inelabteamdev.com, PORT, HEADED=0/1.

## Headed run + recording (from `backend/`)
```
mkdir -p headed-artifacts
SCRAPE_DEBUG=1 node scripts/headed.js 2889 o1
```
Record with OBS/QuickTime (2–4 min): visible browser dismisses consent, hover unlocks the price, a dropped click retries, dashboard shows the new row + CSV export.
