// Price/quote scraper — headless browser required.
// Why browser: PDP price is locked behind hover interaction (min 8 moves +
// 600ms dwell), a WASM challenge + Bearer pass exchange, canvas/WebGL
// fingerprinting, rotating CSS classes (manifest revision), varied price
// formats, and ~35% flaky loader. Plain fetch cannot produce trusted
// mouse events or run the challenge, so Playwright Chromium is used.
// Catalog (listings/items) stays on lightweight fetch in catalog.js.
import { chromium } from 'playwright';

const STORE = (process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com').replace(/\/$/, '');
const MAX_ATTEMPTS = 6; // mirrors site retry budget (jr=6)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toAsciiDigits(s) {
  // fullwidth unicode digits -> ascii
  return s.replace(/[\uFF10-\uFF19]/g, (d) => String(d.charCodeAt(0) - 0xFF10));
}

// Handles: spaced, euro, trailing "/- (incl. of all taxes)", unicode, nbsp+zero-width, lakh "Rs. 1,23,456.00"
export function parsePrice(text) {
  if (!text) return null;
  let t = toAsciiDigits(text);
  t = t.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ''); // zero-width + nbsp
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

let browser = null;
async function getBrowser(headed = false) {
  if (!browser) {
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
    let context = null;
    let page = null;
    try {
      const br = await getBrowser(headed);
      context = await br.newContext({ viewport: { width: 1366, height: 900 } });
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('.pdp', { timeout: 20000 });

      // Select the tracked option (buttons .opt-chip)
      if (optionId) {
        const chip = page.locator('.opt-chip', { hasText: '' });
        // click chip whose aria/state matches option via order: find all and pick by data or label fallback
        const chips = page.locator('.opt-chip');
        const n = await chips.count();
        let clicked = false;
        for (let i = 0; i < n; i++) {
          // option ids are o1/o2/o3 in DOM order; match by index suffix
          const idNum = parseInt(String(optionId).replace(/\D/g, ''), 10);
          if (idNum && i === idNum - 1) { await chips.nth(i).click({ timeout: 8000 }); clicked = true; break; }
        }
        if (!clicked && n > 0) await chips.first().click({ timeout: 8000 }).catch(() => {});
        await sleep(400);
      }

      // Human-like hover over locked price panel (site requires 8+ moves + 600ms dwell)
      const panel = page.locator('.offer-locked, .offer-panel').first();
      await panel.waitFor({ timeout: 15000 });
      const box = await panel.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await page.mouse.move(cx - 120, cy, { steps: 4 });
        for (let i = 0; i < 10; i++) {
          await page.mouse.move(cx - 100 + i * 20, cy + Math.sin(i) * 12, { steps: 2 });
          await sleep(90);
        }
        await sleep(800); // satisfy minDwellMs
      }

      // Click the check-price button (trusted click; site randomly delays/drops 35%)
      const btn = page.locator('button.ctl-main, .offer-panel button').first();
      await btn.waitFor({ timeout: 10000 });
      await btn.click({ timeout: 10000 });

      // Wait for success (.offer-detail / price) or error (.offer-error)
      const winner = await Promise.race([
        page.waitForSelector('.offer-detail, .priceValue, [class*="amt-"], [class*="price"]', { timeout: 18000 }).then(() => 'ok').catch(() => null),
        page.waitForSelector('.offer-error', { timeout: 18000 }).then(() => 'err').catch(() => null),
      ]);
      if (winner === 'err') {
        const msg = (await page.locator('.offer-error').first().innerText().catch(() => 'offer error')).slice(0, 300);
        throw new Error(msg);
      }

      // Extract price + stock with manifest-agnostic fallbacks (classes rotate)
      const bodyText = await page.locator('.offer-detail, .pdp-summary').first().innerText({ timeout: 10000 }).catch(() => '');
      const priceText = await page.locator('strong[class*="amt"], strong[class*="price"], .offer-detail strong, .offer-detail span').first().innerText({ timeout: 8000 }).catch(() => bodyText);
      const price = parsePrice(priceText ?? bodyText);
      const stockText = await page.locator('.avail-pill, [class*="inv-"], [class*="stock"]').first().innerText({ timeout: 8000 }).catch(() => bodyText);
      const stock = parseStock(stockText ?? bodyText);
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
      try { await context?.close(); } catch {}
      if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt); // mirror site backoff
    }
  }
  return { price: null, stock: null, attempts: MAX_ATTEMPTS, outcome: 'failed', message: lastError.slice(0, 500) };
}
