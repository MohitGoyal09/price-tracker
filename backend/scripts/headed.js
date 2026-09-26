// Observable (headed) run: watches the scraper handle slow/failing responses.
// Usage: STORE_BASE_URL=... node scripts/headed.js <productId> <optionId>
// Records screenshots to ./headed-artifacts for the 2-4 min screen recording.
import { scrapeQuote, closeBrowser } from '../src/quote.js';
import { getItem } from '../src/catalog.js';

const [productId = '2746', optionId = 'o1'] = process.argv.slice(2);
console.log(`[headed] scraping product ${productId} option ${optionId} in HEADED mode…`);
const item = await getItem(productId).catch((e) => { console.error('[headed] item fetch failed:', e.message); return null; });
if (item) console.log(`[headed] ${item.name} [${item.brand}] options: ${(item.options || []).map((o) => `${o.id}=${o.label}`).join(', ')}`);
const t0 = Date.now();
const r = await scrapeQuote(productId, optionId, { headed: true, screenshotDir: './headed-artifacts' }).catch((e) => ({ outcome: 'failed', message: e.message }));
console.log(`[headed] done in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(r));
await closeBrowser();
