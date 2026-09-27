# Pulse — Product Price Tracker (INE Intern Assignment)

A full-stack web app that searches the **INE mock store** (`https://demo.inelabteamdev.com`),
tracks product options (storage size, kit, pack size), scrapes live price + stock on a
2-hour schedule, charts price history, keeps an honest per-attempt scrape log, and exports
everything as CSV.

## Live deployments

- **Frontend (Vercel):** https://price-tracker-lime-chi.vercel.app
- **Backend API (Render, Docker):** https://price-tracker-1-e7u9.onrender.com
- **Database:** Supabase PostgreSQL (`price-tracker`, `ap-south-1`)
- **Schedule:** cron-job.org → `GET /api/cron/scrape` every 2h + `GET /api/health` keep-warm every 10 min
- **Repo:** https://github.com/MohitGoyal09/price-tracker

## Repository structure

```
price-tracker/
├── backend/
│   ├── src/
│   │   ├── index.js      # Express API: search, track, history, CSV, cron
│   │   ├── catalog.js    # Lightweight fetch: listings search + item details
│   │   ├── quote.js      # Playwright price scraper (hover + challenge + retries)
│   │   ├── csv.js        # CSV export contract (one row per attempt)
│   │   └── supabase.js   # Supabase client
│   ├── scripts/headed.js # Observable headed-mode runner (video demo)
│   ├── test/             # node:test suite (parsers, CSV contract)
│   ├── Dockerfile        # Playwright v1.63.0-noble image (exact browser+deps)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/ui/ # shadcn-style Button, Input, Card, Badge, Table, Skeleton
│   │   ├── lib/utils.js   # cn() class merger
│   │   ├── App.jsx        # Dashboard: search, tracked cards, logs, sparklines
│   │   └── index.css      # Tailwind + shadcn theme tokens
│   └── package.json
├── supabase/schema.sql   # tracked_products + scrape_attempts tables
├── render.yaml           # Render Blueprint (Docker)
├── README.md
└── DESIGN_NOTE.md        # Reliability choices, trade-offs, AI disclosure
```

## Environment variables

Never committed (see `.gitignore` + `backend/.env.example` for placeholders).
Values live only in local `backend/.env`, the Render dashboard, and Vercel dashboard.

Backend (`backend/.env`, Render dashboard):

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service key from Supabase dashboard → Settings → API>
CRON_SECRET=<long random string, shared with cron-job.org>
STORE_BASE_URL=https://demo.inelabteamdev.com
PORT=4000
```

Frontend (Vercel dashboard, Production — rebuild after changing):

```
VITE_API_URL=https://price-tracker-1-e7u9.onrender.com
```

## Local development

```bash
# 1. Database: run supabase/schema.sql in the Supabase SQL editor
# 2. Backend
cd backend && npm install && npx playwright install chromium
cp .env.example .env   # fill values above
npm start              # :4000
npm test               # parser + CSV contract suite (no deps needed)

# 3. Frontend
cd ../frontend && npm install && npm run dev   # :5173 → localhost:4000
```

Seed 2–3 tracked products from dashboard search, then `Scrape now`.

## Scraping schedule & sleep mitigation

- **Every 2h**, cron-job.org calls `GET /api/cron/scrape?secret=$CRON_SECRET`. The endpoint
  answers `202 started` instantly and scrapes in the background (a full run takes minutes);
  overlapping runs are skipped. No always-on loop — free-tier backends sleep.
- **Every 10 min**, cron-job.org pings `GET /api/health` so Render stays warm inside
  750 free hours/month. `POST /api/scrape-now` triggers a manual run from the dashboard.

## Observable headed run (video demo)

```bash
cd backend && mkdir -p headed-artifacts
SCRAPE_DEBUG=1 node scripts/headed.js 2889 o1
```

Opens visible Chromium: dismisses consent, hovers until the price unlocks, re-clicks
dropped clicks, prints the result. Screenshots land in `headed-artifacts/`.

## CSV export format

`GET /api/export.csv` → `scrape-history.csv`, one row per attempt:

```
store_product_id,product_name,selected_option,timestamp_utc,price,stock,outcome
2889,"Orbisk Tablet Arc","64 GB",2026-09-27T05:30:51.000Z,29841,38,success
2889,"Orbisk Tablet Arc","64 GB",2026-09-27T05:31:51.000Z,,,failed
```

Timestamps are ISO 8601 UTC; failed attempts are included with price/stock empty;
commas/quotes in names are RFC-4180 escaped (covered by `test/csv.test.js`).

## Docs

- `DESIGN_NOTE.md` — how the scraping stays reliable, trade-offs, and what AI
  assistance got wrong (with corrections). Required reading for the interview.
