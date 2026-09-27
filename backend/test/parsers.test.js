import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, parseStock } from '../src/quote.js';

// The store renders prices in rotating formats (see manifest revisions).
// The parser must normalize every variant to the same integer rupees.
describe('parsePrice', () => {
  it('plain INR format', () => assert.equal(parsePrice('₹42,999'), 42999));
  it('spaced format', () => assert.equal(parsePrice('₹ 4 2 9 9 9'), 42999));
  it('euro-style dots', () => assert.equal(parsePrice('₹42.999,00'), 42999));
  it('trailing suffix', () => assert.equal(parsePrice('₹42,999/- (incl. of all taxes)'), 42999));
  it('fullwidth unicode digits', () => assert.equal(parsePrice('₹４２９９９'), 42999));
  it('nbsp + zero-width joiners', () => assert.equal(parsePrice('₹\u00a042\u200b,\u200c999'), 42999));
  it('lakh format', () => assert.equal(parsePrice('Rs.\u00a01,23,456.00'), 123456));
  it('rejects empty and non-numeric', () => {
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('Check today’s price'), null);
  });
});

describe('parseStock', () => {
  it('units available', () => assert.equal(parseStock('12 units available'), 12));
  it('stock remaining', () => assert.equal(parseStock('Stock: 3 remaining'), 3));
  it('sold out is zero, not null', () => assert.equal(parseStock('Sold out'), 0));
  it('rejects empty', () => assert.equal(parseStock(''), null));
});
