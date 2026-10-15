import { describe, expect, it } from 'vitest';
import { parseReceiptText } from '../src/lib/receipt.js';

const RECEIPT = `MEIJER
123 MAIN ST
BANANAS 1.29
MILK 2% GAL 3.49
EGGS LARGE 18CT 4.99
SUBTOTAL 9.77
TAX 0.00
TOTAL 9.77
DEBIT 9.77
THANK YOU`;

describe('receipt parsing', () => {
  const r = parseReceiptText(RECEIPT);

  it('finds the merchant, items and total', () => {
    expect(r.merchant).toBe('MEIJER');
    expect(r.items.map((i) => [i.name, i.price])).toEqual([
      ['BANANAS', 1.29],
      ['MILK 2% GAL', 3.49],
      ['EGGS LARGE 18CT', 4.99],
    ]);
    expect(r.total).toBe(9.77);
  });

  it('skips subtotal, tax and payment lines', () => {
    expect(r.items.some((i) => /subtotal|tax|debit/i.test(i.name))).toBe(false);
  });

  // Known gap, kept as-is in 0.2.0: a card-brand line ("VISA 9.77") is read
  // as an item because the skip list only has generic payment words. This
  // test flips to a failure, on purpose, once that is fixed.
  it.fails('skips card-brand payment lines', () => {
    const v = parseReceiptText('STORE\nBREAD 2.50\nTOTAL 2.50\nVISA 2.50');
    expect(v.items.map((i) => i.name)).toEqual(['BREAD']);
  });
});
