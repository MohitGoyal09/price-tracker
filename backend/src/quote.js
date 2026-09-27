// Price/quote scraper — headless browser required.
// Why browser: PDP price is locked behind hover interaction (min 8 moves +
// 600ms dwell), a WASM challenge + Bearer pass exchange, canvas/WebGL
// fingerprinting, rotating CSS classes (manifest revision), varied price
// formats, and ~35% flaky loader. Plain fetch cannot produce trusted
// mouse events or run the challenge, so Playwright Chromium is used.
// Catalog (listings/items) stays on lightweight fetch in catalog.js.
//
// NOTE: playwright is imported lazily inside getBrowser (not at top level)
// so requiring this module — e.g. for parsePrice/parseStock in tests, or
// backend boot on small cloud instances — never pays browser-lib load cost
// or crashes when browser packages are absent.

const STORE = (process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const MAX_ATTEMPTS = 6; // mirrors site retry budget (jr=6)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DBG = process.env.SCRAPE_DEBUG ? (...a) => console.log('[scrape-dbg]', ...a) : () => {};

function toAsciiDigits(s) {
  // fullwidth unicode digits -> ascii
  return s.replace(/[\uFF10-\uFF19]/g, (d) => String(d.charCodeAt(0) - 0xFF10));
}

// Handles: spaced, euro, trailing "/- (incl. of all taxes)", unicode, nbsp+zero-width, lakh "Rs. 1,23,456.00"
export function parsePrice(text) {
  if (!text) return null;
  let t = toAsciiDigits(text);
  t = t.replace(/[ -﻿ ]/g, ''); // zero-width + nbsp
  // European-style thousand dots: 42.999,00 → 42999 (dot required in the
  // integer part so Indian "1,23,456.00" never matches this branch).
  const eu = t.match(/(\d[\d.]*\.\d[\d.]*),(\d{2})(?!\d)/);
  if (eu) {
    const euNum = Number(eu[1].replace(/\./g, ''));
    return Number.isFinite(euNum) && euNum > 0 ? Math.round(euNum) : null;
  }
  const m = t.match(/[\d][\d,.\s]*\d|\d/);
  if (!m) return null;
  const num = Number(m[0].replace(/[, ]/g, ''));
  return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
}

export function parseStock(text) {
  if (!text) return null;
  if (/sold\s*out/i.test(text)) return 0;
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// The consent modal (.consent-scrim) can pop up at ANY time — on load or
// seconds later — and covers the viewport, eating all hovers/clicks. Call
// before every interaction; cheap no-op when absent. Takes Reject (last).
async function dismissScrim(page) {
  const btn = page.locator('.consent-scrim button').last();
  if (await btn.count()) {
    await btn.click({ timeout: 5000 }).catch(() => {});
    await page.locator('.consent-scrim').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    await sleep(400);
  }
}

let browser = null;
async function getBrowser(headed = false) {
  // Singleton browser, but a FRESH incognito-style context per attempt:
  // the store flags sessions after failed challenges, and stale cookies
  // poison subsequent attempts. Consent scrim reappears each attempt and
  // is dismissed by dismissScrim().
  if (!browser) {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: !headed,
      slowMo: headed ? 120 : 0,
      args: ['--disable-blink-features=AutomationControlled'],
    });
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
}

// Scrape one (productId, optionId). Returns { price, stock, attempts, outcome, message }.
// Never throws on scrape failure — failure is returned as outcome:'failed' so the
// caller can log it honestly instead of storing wrong data.
export async function scrapeQuote(productId, optionId, { headed = false, screenshotDir = null } = {}) {
  const url = `${STORE}/item/${encodeURIComponent(productId)}`;
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    DBG(`--- attempt ${attempt} ---`);
    let context = null;
    let page = null;
    try {
      const br = await getBrowser(headed);
      context = await br.newContext({ viewport: { width: 1366, height: 900 } });
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      // Block images/fonts/media: the PDP is a data-driven SPA — visuals add
      // load time but nothing the scraper reads. CSS+JS stay (layout and the
      // price-challenge logic need them; Playwright also requires visibility).
      await page.route('**/*', (route) => {
        const rt = route.request().resourceType();
        if (rt === 'image' || rt === 'font' || rt === 'media') return route.abort();
        return route.continue();
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('.pdp', { timeout: 20000 });

      // Dismiss consent scrim (may appear on load or seconds later).
      await dismissScrim(page);

      // Select the tracked option (buttons .opt-chip render after item fetch)
      if (optionId) {
        // click chip whose aria/state matches option via order: find all and pick by data or label fallback
        const chips = page.locator('.opt-chip');
        await chips.first().waitFor({ timeout: 10000 }).catch(() => {});
        const n = await chips.count();
        let clicked = false;
        for (let i = 0; i < n; i++) {
          // option ids are o1/o2/o3 in DOM order; match by index suffix
          const idNum = parseInt(String(optionId).replace(/\D/g, ''), 10);
          if (idNum && i === idNum - 1) {
            // Skip the click when already selected (avoids a pointless
            // re-render + re-lock of the price panel).
            const pressed = await chips.nth(i).getAttribute('aria-pressed').catch(() => null);
            if (pressed !== 'true') {
              await dismissScrim(page);
              await chips.nth(i).click({ timeout: 8000 });
              await sleep(400);
            }
            clicked = true;
            break;
          }
        }
        if (!clicked && n > 0) await chips.first().click({ timeout: 8000 }).catch(() => {});
      }

      // Ensure the price button is enabled: hover until it is (a late
      // consent scrim can intercept hovers, so re-dismiss + re-hover).
      const btn = page.locator('.offer-panel button.ctl-main').first();
      await btn.waitFor({ timeout: 10000 });
      let enabled = false;
      for (let h = 0; h < 3 && !enabled; h++) {
        await dismissScrim(page);
        const panel = page.locator('.offer-locked, .offer-panel').first();
        await panel.waitFor({ timeout: 15000 });
        const box = await panel.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
          await page.mouse.move(cx - 120, cy, { steps: 4 });
          for (let i = 0; i < 12; i++) {
            await page.mouse.move(cx - 100 + i * 20, cy + Math.sin(i) * 12, { steps: 2 });
            await sleep(90);
          }
          await sleep(900); // satisfy minDwellMs
        }
        enabled = await btn.evaluate((b) => !b.disabled).catch(() => false);
        DBG(`hover iter ${h}: enabled=${enabled}`);
      }
      if (!enabled) throw new Error('price button stayed disabled after hover (possible overlay)');

      // Click until the app leaves idle (the site drops ~17% of clicks), then
      // await the quote round-trip with stall detection (endpoints hang).
      // NOTE: the failure panel class is .offer-failed (not .offer-error).
      // Scope to button.ctl-main — a secondary "Check again" button may also
      // live inside .offer-panel and .first() would grab the wrong one.
      let started = false;
      for (let c = 0; c < 3 && !started; c++) {
        await dismissScrim(page);
        await btn.click({ timeout: 15000 });
        await sleep(2000); // grace: let loading render before sampling state
        // NOTE: waitForFunction resolves to a JSHandle — must unwrap via
        // jsonValue(); signature is (fn, arg, options).
        const stateHandle = await page.waitForFunction(() => {
          if (document.querySelector('.offer-ready')) return 'ok';
          if (document.querySelector('.offer-failed')) return 'err';
          const b = document.querySelector('.offer-panel button.ctl-main');
          if (!b || b.disabled) return 'busy';
          return null;
        }, null, { timeout: 9000 }).catch(() => null);
        const state = stateHandle ? await stateHandle.jsonValue().catch(() => null) : null;
        DBG(`click ${c}: state=${state}`);
        if (state) { started = state; break; }
      }
      if (!started) throw new Error('price check never started (clicks dropped)');
      let outcome = started;
      if (outcome === 'busy') {
        // The app retries internally (up to 6x with backoff) on flaky
        // challenge/quote responses, and endpoints sometimes hang. Poll with
        // stall detection: anytime API traffic flows or the status message
        // changes, the app is alive — give it up to 300s. If nothing moves
        // for 75s, abandon this attempt and retry fresh.
        let lastProgress = Date.now();
        let lastMsg = '';
        const apiSeen = { at: 0 };
        const onResp = (r) => {
          if (r.url().includes('/api/v2/handshake') || r.url().includes('/quote')) apiSeen.at = Date.now();
        };
        page.on('response', onResp);
        try {
          const deadline = Date.now() + 300000;
          while (!outcome && Date.now() < deadline) {
            const hit = await Promise.race([
              page.waitForSelector('.offer-ready', { timeout: 5000 }).then(() => 'ok').catch(() => null),
              page.waitForSelector('.offer-failed', { timeout: 5000 }).then(() => 'err').catch(() => null),
            ]);
            if (hit) { outcome = hit; break; }
            const msg = await page.locator('.offer-msg').first().innerText().catch(() => '');
            if (msg !== lastMsg || apiSeen.at > lastProgress) {
              lastMsg = msg;
              lastProgress = Math.max(Date.now(), apiSeen.at);
              DBG(`progress: msg=${msg.slice(0, 60)}`);
            }
            if (Date.now() - lastProgress > 75000) {
              outcome = 'stalled';
              break;
            }
          }
        } finally {
          page.off('response', onResp);
        }
        if (outcome === 'stalled') throw new Error('quote stalled: no API traffic or status change for 75s');
      }
      if (outcome === 'err') {
        const msg = (await page.locator('.offer-failed .offer-submsg').first().innerText().catch(() => 'offer failed')).slice(0, 300);
        throw new Error(msg);
      }
      if (outcome !== 'ok') throw new Error('offer panel never unlocked (timeout)');

      // Extract price + stock strictly inside .offer-ready (classes rotate
      // per manifest revision, so match loosely but stay scoped). The price
      // text can arrive a beat after the panel mounts — wait for content.
      const detail = page.locator('.offer-ready');
      await page.waitForFunction(() => {
        const el = document.querySelector('.offer-ready');
        return !!(el && /₹|Rs\.?|INR/i.test(el.innerText || ''));
      }, null, { timeout: 10000 }).catch(() => {});
      const priceText = await detail.locator('strong, [class*="amt-"], [class*="price"]').first().innerText({ timeout: 8000 }).catch(() => '');
      // Correctness guard: site formats via Intl en-IN, so a real price always
      // carries ₹ / Rs / INR. Without it we are looking at an ID or decoy.
      if (!/[₹]|Rs\.?|INR/i.test(priceText)) {
        throw new Error(`no currency marker in price text: ${priceText.slice(0, 120)}`);
      }
      const price = parsePrice(priceText);
      const stockText = await detail.locator('.avail-pill, [class*="inv-"], [class*="stock"]').first().innerText({ timeout: 8000 }).catch(() => '');
      const stock = parseStock(stockText);
      if (screenshotDir && headed) await page.screenshot({ path: `${screenshotDir}/quote-${productId}-${optionId}-a${attempt}.png` }).catch(() => {});

      if (price == null) throw new Error(`price parse failed from: ${(priceText || '').slice(0, 120)}`);
      if (stock == null) throw new Error(`stock parse failed from: ${(stockText || '').slice(0, 120)}`);

      await context.close().catch(() => {});
      return {
        price, stock,
        attempts: attempt,
        outcome: attempt > 1 ? 'retried' : 'success',
        message: attempt > 1 ? `succeeded on attempt ${attempt}` : 'ok',
      };
    } catch (e) {
      lastError = e?.message || String(e);
      DBG(`attempt ${attempt} failed: ${String(lastError).split('\n')[0].slice(0, 160)}`);
      try { await context?.close(); } catch {}
      if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); // mirror site backoff
    }
  }
  return { price: null, stock: null, attempts: MAX_ATTEMPTS, outcome: 'failed', message: lastError.slice(0, 500) };
}
