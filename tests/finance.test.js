import { describe, expect, it } from 'vitest';
import { amortize, simulatePayoff, splitPayment } from '../src/lib/finance.js';
import { loadLegacy } from './legacy.js';

const legacy = loadLegacy('amortize', 'splitPayment', 'simulatePayoff');

const DEBTS = [
  { id: 'cc', name: 'Card', balance: 4200, rate: 24.99, min_payment: 120 },
  { id: 'car', name: 'Car', balance: 11800, rate: 6.4, min_payment: 310 },
  { id: 'med', name: 'Medical', balance: 900, rate: 0, min_payment: 50 },
  { id: 'stu', name: 'Student', balance: 22000, rate: 4.5, min_payment: 240 },
];

describe('matches the deployed app', () => {
  it.each([
    [5000, 19.99, 150, 0],
    [5000, 19.99, 150, 100],
    [250000, 6.75, 1621, 0],
    [1000, 0, 25, 0],
    [3000, 29.99, 50, 0], // payment below interest: never pays off
  ])('amortize(%s, %s, %s, %s)', (...args) => {
    expect(amortize(...args)).toEqual(legacy.amortize(...args));
  });

  it.each([[0], [100], [500]])('simulatePayoff with %s extra, both strategies', (extra) => {
    for (const strategy of ['avalanche', 'snowball']) {
      expect(simulatePayoff(DEBTS, extra, strategy)).toEqual(legacy.simulatePayoff(DEBTS, extra, strategy));
    }
  });

  it('splitPayment', () => {
    expect(splitPayment(300, 4200, 24.99)).toEqual(legacy.splitPayment(300, 4200, 24.99));
  });
});

describe('payoff behavior', () => {
  it('avalanche never pays more interest than snowball', () => {
    for (const extra of [0, 50, 200, 1000]) {
      const av = simulatePayoff(DEBTS, extra, 'avalanche');
      const sn = simulatePayoff(DEBTS, extra, 'snowball');
      expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest + 0.01);
    }
  });

  it('snowball pays the smallest balance off first', () => {
    expect(simulatePayoff(DEBTS, 200, 'snowball').payoffOrder[0].id).toBe('med');
  });

  it('extra payment shortens the payoff', () => {
    expect(simulatePayoff(DEBTS, 300, 'avalanche').months).toBeLessThan(simulatePayoff(DEBTS, 0, 'avalanche').months);
  });

  it('a payment that cannot cover interest reports never', () => {
    expect(amortize(3000, 29.99, 50).months).toBe(Infinity);
  });
});
