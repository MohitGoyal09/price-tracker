import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDrop } from '../src/alerts.js';

// Bonus deliverable: alert when a success lands ≥ threshold below the
// previous successful price. Consecutive comparisons mean a sustained low
// price alerts once instead of every run.
describe('detectDrop', () => {
  it('fires on a drop at/above threshold', () => {
    assert.deepEqual(detectDrop(10000, 9000, 5), { oldPrice: 10000, newPrice: 9000, dropPct: 10 });
  });
  it('ignores drops below threshold', () => {
    assert.equal(detectDrop(10000, 9700, 5), null);
  });
  it('ignores increases and flats', () => {
    assert.equal(detectDrop(9000, 10000, 5), null);
    assert.equal(detectDrop(9000, 9000, 5), null);
  });
  it('ignores missing prices', () => {
    assert.equal(detectDrop(null, 9000, 5), null);
    assert.equal(detectDrop(10000, null, 5), null);
  });
  it('respects a custom threshold', () => {
    assert.equal(detectDrop(10000, 9000, 15), null);
    assert.deepEqual(detectDrop(10000, 8000, 15), { oldPrice: 10000, newPrice: 8000, dropPct: 20 });
  });
});
