# Design note — how scraping stays reliable

## What the store does (reverse-engineered from bundle + live APIs)
- Catalog: `GET /api/v2/listings?page&limit` (cap 60/page, 960 items) and `GET /api/v2/items/:id` are plain JSON. Search has no server param so we page (≤16 pages) and substring-match client-side.
- PDP (`/item/:id`): price is **locked** until hover (≥8 mousemoves + 600ms dwell), then a WASM challenge + Bearer pass exchange returns an encrypted quote (`shown,mrp,sale,stock,…`). ~35% of clicks are randomly dropped/delayed 900ms. CSS classes rotate per manifest revision (`/api/v2/ui/manifest`), price formats vary (spaced/euro/trailing/unicode/nbsp/lakh), stock/delivery phrasing varies, canvas+WebGL fingerprinting runs.

## Reliability choices
- Hybrid: lightweight fetch for catalog, **Playwright Chromium** only for price (genuinely needs JS + trusted mouse events + WASM).
- Human-like hover (10 stepped moves + 800ms dwell), 6 attempts with 300×n ms backoff (mirrors site), 20–25s timeouts, per-attempt fresh browser context.
- Manifest-agnostic parsing: try scoped selectors first, fall back to panel/body text; `parsePrice` normalizes fullwidth digits, strips zero-width/nbsp, extracts first number; `parseStock` handles "Sold out"→0.
- Honest logging: every attempt → `scrape_attempts` row (`success`/`retried`/`failed`); failures store NULL price/stock and appear in CSV + dashboard log. Never write parsed-garbage: null price/stock ⇒ failed, not zero.
- Scheduling: external cron every 2h (Render free sleeps); no in-process loop.

## Trade-offs
- Full-browser per product is slower (~10–20s) vs API; accepted because challenge requires it. Sequential scrapes avoid rate-limit 429s.
- Client-side search pages up to 16 requests; capped at 60 results for UI speed.
- No price-drop emails yet (bonus); schema supports it via history query.

## What AI got wrong first, and fixes
1. Assumed SSR HTML scraping (cheerio) would work — store is empty-root SPA; fixed by checking `curl` output and switching to API+Playwright hybrid.
2. Assumed `?q=` search param existed — tested `q`/`search`, both ignored (totalPages unchanged); fixed with paged client-side filter.
3. Assumed stable selectors (`.price`) — manifest shows rotating classes + varied formats; fixed with manifest-agnostic fallbacks + normalizers.
4. First Playwright draft clicked immediately — price stayed locked; fixed after reading `minMoves:8,minDwellMs:600` + `isTrusted` gate, adding stepped hover + dwell.
5. AI disclosure: used AI for scaffolding + bundle analysis; all site behavior above was verified by hand (`curl`, JS grep) and code was read before accepting.
