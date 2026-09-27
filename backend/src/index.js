import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { supabase } from './supabase.js';
import { searchCatalog, getItem } from './catalog.js';
import { scrapeQuote, closeBrowser } from './quote.js';

const app = express();
app.use(cors());
app.use(express.json());

const CRON_SECRET = process.env.CRON_SECRET || null;

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 1. Search mock store by partial/full name (lightweight fetch)
app.get('/api/search', async (req, res) => {
  try {
    const results = await searchCatalog(req.query.q || '');
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    res.json(await getItem(req.params.id));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// 2. Track a product+option
app.post('/api/track', async (req, res) => {
  const { store_product_id, selected_option_id } = req.body || {};
  if (!store_product_id || !selected_option_id) return res.status(400).json({ error: 'store_product_id and selected_option_id required' });
  try {
    const item = await getItem(store_product_id);
    const opt = (item.options || []).find((o) => o.id === selected_option_id) || { id: selected_option_id, label: selected_option_id };
    const row = {
      store_product_id: String(item.id),
      product_name: item.name,
      brand: item.brand,
      category: item.category,
      sku: item.sku,
      product_url: `${process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com'}/item/${item.id}`,
      selected_option_id: opt.id,
      selected_option_label: opt.label || opt.id,
    };
    const { data, error } = await supabase.from('tracked_products').upsert(row, { onConflict: 'store_product_id,selected_option_id' }).select().single();
    if (error) throw error;
    // immediate first scrape so dashboard has data
    scrapeAndLog(data).catch(() => {});
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/tracked', async (_req, res) => {
  const { data, error } = await supabase.from('tracked_products').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/tracked/:id', async (req, res) => {
  const { error } = await supabase.from('tracked_products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// 3+4. History + per-product scrape log
app.get('/api/history/:id', async (req, res) => {
  const { data, error } = await supabase.from('scrape_attempts').select('*').eq('tracked_product_id', req.params.id).order('scraped_at', { ascending: true }).limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Export: one row per scrape attempt (ISO UTC, empty price/stock on failure)
app.get('/api/export.csv', async (_req, res) => {
  const { data, error } = await supabase.from('scrape_attempts').select('*').order('scraped_at', { ascending: true }).limit(5000);
  if (error) return res.status(500).json({ error: error.message });
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['store_product_id,product_name,selected_option,timestamp_utc,price,stock,outcome'];
  for (const r of data || []) {
    lines.push([r.store_product_id, q(r.product_name), q(r.selected_option), new Date(r.scraped_at).toISOString(), r.price ?? '', r.stock ?? '', r.outcome].join(','));
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="scrape-history.csv"');
  res.send(lines.join('\n'));
});

async function scrapeAndLog(tracked) {
  const started = Date.now();
  const r = await scrapeQuote(tracked.store_product_id, tracked.selected_option_id, { headed: process.env.HEADED === '1' });
  // The product may have been untracked while the scrape was in flight —
  // skip logging instead of violating the FK constraint.
  const { data: stillThere } = await supabase.from('tracked_products').select('id').eq('id', tracked.id).maybeSingle();
  if (!stillThere) {
    console.log(`[scrape] ${tracked.product_name} untracked mid-scrape, skipping log`);
    return r;
  }
  const { error } = await supabase.from('scrape_attempts').insert({
    tracked_product_id: tracked.id,
    store_product_id: tracked.store_product_id,
    product_name: tracked.product_name,
    selected_option: tracked.selected_option_label || tracked.selected_option_id,
    price: r.price,
    stock: r.stock,
    outcome: r.outcome,
    attempt: r.attempts,
    message: `${r.message} (${Date.now() - started}ms)`.slice(0, 500),
  });
  if (error) console.error('[scrape] log failed:', error.message);
  return r;
}

// Scheduled scraping: every 2h via cron-job.org -> GET /api/cron/scrape?secret=...
// (free-tier backends sleep; no always-on loop — external cron wakes us)
// Responds 202 immediately and scrapes in the background: a full run takes
// minutes, far longer than any cron HTTP timeout. Overlapping runs are
// skipped via the in-memory guard (single instance).
let cronRunning = false;
app.get('/api/cron/scrape', async (req, res) => {
  if (CRON_SECRET && req.query.secret !== CRON_SECRET) return res.status(401).json({ error: 'bad secret' });
  if (cronRunning) return res.status(202).json({ status: 'already-running' });
  cronRunning = true;
  res.status(202).json({ status: 'started' });
  try {
    const { data: tracked } = await supabase.from('tracked_products').select('*');
    for (const t of tracked || []) {
      await scrapeAndLog(t).catch((e) => console.error('[cron] scrape failed:', t.product_name, e.message));
    }
    console.log(`[cron] background run done (${(tracked || []).length} products)`);
  } finally {
    cronRunning = false;
  }
});

// Manual trigger (dashboard button + headed demo)
app.post('/api/scrape-now', async (_req, res) => {
  const { data: tracked } = await supabase.from('tracked_products').select('*');
  const results = [];
  for (const t of tracked || []) results.push({ product: t.product_name, ...(await scrapeAndLog(t)) });
  res.json({ scraped: results.length, results });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`[backend] listening on :${port}`));
process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0); });
