// CSV export contract (assignment spec): one row per scrape attempt with
// store_product_id, product_name, selected_option, timestamp (ISO 8601 UTC),
// price, stock, outcome. Failed attempts included with price/stock empty.
const HEADER = 'store_product_id,product_name,selected_option,timestamp_utc,price,stock,outcome';

const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function buildCsv(rows) {
  const lines = [HEADER];
  for (const r of rows || []) {
    lines.push(
      [
        r.store_product_id,
        q(r.product_name),
        q(r.selected_option),
        new Date(r.scraped_at).toISOString(),
        r.price ?? '',
        r.stock ?? '',
        r.outcome,
      ].join(',')
    );
  }
  return lines.join('\n');
}
