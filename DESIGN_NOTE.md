# Design note — how scraping stays reliable

## What the store does (reverse-engineered from bundle + live APIs)
- Catalog: `GET /api/v2/listings?page&limit` (cap 60/page, 960 items) and `GET /api/v2/items/:id` are plain JSON. Search has no server param so we page (≤16 pages) and substring-match client-side.
- PDP (`/item/:id`): price is **locked** until hover (≥8 mousemoves + 600ms dwell), then a WASM challenge + Bearer pass exchange returns an encrypted quote (`shown,mrp,sale,stock,…`). ~35% of clicks are randomly dropped/delayed 900ms. CSS classes rotate per manifest revision (`/api/v2/ui/manifest`), price formats vary (spaced/euro/trailing/unicode/nbsp/lakh), stock/delivery phrasing varies, canvas+WebGL fingerprinting runs.

## Reliability choices
- Hybrid: lightweight fetch for catalog, **Playwright Chromium** only for price (genuinely needs JS + trusted mouse events + WASM).
- Human-like hover (12 stepped moves + 900ms dwell), verified enabled-state before clicking; 6 attempts with 300×n ms backoff (mirrors site); per-attempt fresh browser context (a flagged session can't poison later attempts).
- Cookie-consent scrim (`.consent-scrim`) dismissed before every interaction — it covers the viewport, appears at random times, and eats all hovers/clicks.
- Clicks re-fired until the app leaves idle (site drops ~17% silently), then stall-aware result wait: up to 300s while API traffic/status text moves, abort after 75s of silence.
- Manifest-agnostic parsing scoped strictly inside `.offer-ready` (verified in the bundle — the assumed `.offer-detail` class never existed). `parsePrice` normalizes fullwidth digits, strips zero-width/nbsp; a `₹/Rs/INR` marker is required before any number is accepted, so product IDs and decoy digits can't be stored as prices. `parseStock` handles "Sold out"→0.
- Honest logging: every attempt → `scrape_attempts` row (`success`/`retried`/`failed`); failures store NULL price/stock and appear in CSV + dashboard log. Never write parsed-garbage: null price/stock ⇒ failed, not zero.
- Scheduling: external cron every 2h (Render free sleeps); no in-process loop.

## Trade-offs
- Full-browser per product is slower (~30–60s typical) vs API; accepted because challenge requires it. Sequential scrapes avoid rate-limit 429s.
- Client-side search pages up to 16 requests; capped at 60 results for UI speed.
- No price-drop emails yet (bonus); schema supports it via history query.

## What AI got wrong first, and fixes
1. Assumed SSR HTML scraping (cheerio) would work — store is empty-root SPA; fixed by checking `curl` output and switching to API+Playwright hybrid.
2. Assumed `?q=` search param existed — tested `q`/`search`, both ignored (totalPages unchanged); fixed with paged client-side filter.
3. Assumed stable selectors (`.price`) — manifest shows rotating classes + varied formats; fixed with manifest-agnostic fallbacks + normalizers.
4. First Playwright draft clicked immediately — price stayed locked; fixed after reading `minMoves:8,minDwellMs:600` + `isTrusted` gate, adding stepped hover + dwell.
5. Assumed the success panel was `.offer-detail` — bundle grep proved it is `.offer-ready`; every success was silently discarded until fixed. Lesson: verify selectors against the bundle, never from memory.
6. `page.waitForFunction()` returns a JSHandle, not the value — it stringifies as `"ok"` (perfect-looking logs!) while `=== 'ok'` is always false. Fixed with `.jsonValue()`. This one bug caused a full day of phantom failures.
7. Deleted history rows where price equaled the product ID as "parser errors" — the store genuinely prices that way sometimes. Lesson: don't "clean" data on a hunch; the currency-marker guard already prevents real misparses.
8. AI disclosure: used AI for scaffolding + bundle analysis; all site behavior above was verified by hand (`curl`, JS grep, screenshots of headless runs) and code was read before accepting.
