# Product Price Tracker (INE intern assignment)

## Setup
1. Supabase: run `supabase/schema.sql` in SQL editor. Requires `pgcrypto` for `gen_random_uuid` (enabled by default).
2. Backend (`backend/`):
   ```
   npm install
   npx playwright install --with-deps chromium
   cp .env.example .env  # fill SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET
   npm start  # :4000
   ```
3. Frontend (`frontend/`):
   ```
   npm install
   VITE_API_URL=https://<render-backend> npm run build  # Vercel: set VITE_API_URL env
   ```
4. Seed 2–3 tracked products from the dashboard search, then trigger `Scrape now`.

## Scraping schedule
- External cron (cron-job.org) every 2h: `GET https://<backend>/api/cron/scrape?secret=$CRON_SECRET`.
- No always-on loop (free tier sleeps). Manual `POST /api/scrape-now` for demos.

## Env vars (backend)
SUPABASE_URL, SUPABASE_SERVICE_KEY (server-only), CRON_SECRET, STORE_BASE_URL=https://demo.inelabteamdev.com, PORT, HEADED=0/1.

## Headed run + recording
```
mkdir -p headed-artifacts
STORE_BASE_URL=https://demo.inelabteamdev.com node scripts/headed.js 2746 o1
```
Record with OBS/QuickTime (2–4 min): show hover unlocking price, a retry on flaky load, final success row in dashboard + CSV export.
