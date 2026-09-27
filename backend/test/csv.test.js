import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv } from '../src/csv.js';

// Assignment CSV contract: one row per attempt, ISO-8601 UTC timestamps,
// failed attempts included with price/stock left empty.
describe('buildCsv', () => {
  const rows = [
    { store_product_id: '2889', product_name: 'Orbisk Tablet Arc', selected_option: '64 GB', scraped_at: '2026-09-27T05:30:51Z', price: 29841, stock: 38, outcome: 'success' },
    { store_product_id: '2889', product_name: 'Orbisk Tablet Arc', selected_option: '64 GB', scraped_at: '2026-09-27T05:31:51Z', price: null, stock: null, outcome: 'failed' },
    { store_product_id: '2186', product_name: 'Brightwell "Edge", Yoga', selected_option: 'Regular', scraped_at: '2026-09-27T05:32:51Z', price: 35378, stock: 163, outcome: 'retried' },
  ];
  const lines = buildCsv(rows).split('\n');

  it('header columns in spec order', () => {
    assert.equal(lines[0], 'store_product_id,product_name,selected_option,timestamp_utc,price,stock,outcome');
  });
  it('one row per attempt', () => assert.equal(lines.length, 4));
  it('success row values', () => {
    assert.equal(lines[1], '2889,"Orbisk Tablet Arc","64 GB",2026-09-27T05:30:51.000Z,29841,38,success');
  });
  it('failed row leaves price/stock empty', () => {
    assert.equal(lines[2], '2889,"Orbisk Tablet Arc","64 GB",2026-09-27T05:31:51.000Z,,,failed');
  });
  it('quotes and commas are escaped', () => {
    assert.ok(lines[3].includes('"Brightwell ""Edge"", Yoga"'));
  });
  it('timestamps are ISO UTC', () => {
    assert.ok(lines[1].includes('2026-09-27T05:30:51.000Z'));
  });
});
