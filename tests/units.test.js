import { describe, expect, it } from 'vitest';
import { normalizeUnitPrice, sameUnitGroup } from '../src/lib/units.js';
import { loadLegacy } from './legacy.js';

const legacy = loadLegacy('UNIT_CONV', 'normalizeUnitPrice', 'sameUnitGroup');

describe('unit normalization', () => {
  it('compares a per-lb price against a per-oz price correctly', () => {
    // The reported bug: $4.00/lb looked cheaper than $2.30/lb when one was entered in oz.
    const a = normalizeUnitPrice(4.0, 'lbs').normalized;
    const b = normalizeUnitPrice(2.3, 'lbs').normalized;
    const c = normalizeUnitPrice(0.25, 'oz').normalized;
    expect(b).toBeLessThan(a);
    expect(c).toBeCloseTo(a, 6);
  });

  it('converts metric weight and volume into the same base', () => {
    expect(normalizeUnitPrice(10, 'kg').base).toBe('oz');
    expect(normalizeUnitPrice(3, 'gal').base).toBe('fl oz');
    expect(normalizeUnitPrice(2, 'count').base).toBe('count');
  });

  it('only compares units in the same group', () => {
    expect(sameUnitGroup('oz', 'lbs')).toBe(true);
    expect(sameUnitGroup('oz', 'fl oz')).toBe(false);
    expect(sameUnitGroup('mL', 'gal')).toBe(true);
  });

  it.each(['oz', 'lbs', 'lb', 'g', 'kg', 'fl oz', 'mL', 'L', 'gal', 'count', 'pkg', 'nonsense'])(
    'matches the deployed app for %s',
    (unit) => {
      expect(normalizeUnitPrice(3.49, unit)).toEqual(legacy.normalizeUnitPrice(3.49, unit));
    },
  );
});
