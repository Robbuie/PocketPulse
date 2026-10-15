import { describe, expect, it } from 'vitest';
import { cycleFor, detectRecurring, dueAutologs, findPayment, itemStatus, monthlyCost, summarize } from '../src/lib/recurring.js';

const NOW = new Date(2026, 9, 14); // Oct 14, 2026
const netflix = { id: 'n', name: 'Netflix', merchant_pattern: 'NETFLIX', amount: 15.49, cadence: 'monthly', day_of_month: 9, status: 'active' };
const rent = { id: 'r', name: 'Rent', merchant_pattern: 'RENT', amount: 1400, cadence: 'monthly', day_of_month: 1, status: 'active', autolog: true, budget_line_id: 'home' };
const phone = { id: 'p', name: 'Phone', merchant_pattern: 'VERIZON', amount: 80, amount_varies: true, cadence: 'monthly', day_of_month: 18, status: 'active' };
const prime = { id: 'a', name: 'Amazon Prime', merchant_pattern: 'AMAZON PRIME', amount: 139, cadence: 'yearly', month_of_year: 3, day_of_month: 4, status: 'active' };

describe('cycles', () => {
  it('monthly items are due in the current month, clamped to its length', () => {
    expect(cycleFor(netflix, NOW)).toEqual({ key: '2026-10', due: '2026-10-09' });
    expect(cycleFor({ ...netflix, day_of_month: 31 }, new Date(2026, 1, 3))).toEqual({ key: '2026-02', due: '2026-02-28' });
  });
  it('a yearly item shows next year once this year is more than a month past', () => {
    expect(cycleFor(prime, NOW)).toEqual({ key: '2027', due: '2027-03-04' });
    expect(cycleFor(prime, new Date(2026, 2, 20))).toEqual({ key: '2026', due: '2026-03-04' });
  });
  it('a year of an item costs the same per month', () => {
    expect(monthlyCost(prime)).toBeCloseTo(139 / 12);
    expect(monthlyCost(netflix)).toBe(15.49);
  });
});

describe('seen, due soon, late', () => {
  const txs = [
    { id: 't1', date: '2026-10-10', amount: 15.49, merchant: 'Netflix', description: 'NETFLIX.COM' },
    { id: 't2', date: '2026-10-12', amount: 15.49, merchant: 'Hulu', description: 'HULU' },
    { id: 't3', date: '2026-09-09', amount: 15.49, merchant: 'Netflix', description: 'NETFLIX.COM' }, // last month
  ];
  it('a charge from the merchant near the due date counts', () => {
    expect(findPayment(netflix, cycleFor(netflix, NOW), txs).id).toBe('t1');
    expect(itemStatus(netflix, txs, NOW).status).toBe('seen');
  });
  it('the wrong amount does not count unless the amount varies', () => {
    const t = [{ id: 'x', date: '2026-10-09', amount: 22.99, merchant: 'Netflix' }];
    expect(itemStatus(netflix, t, NOW).status).not.toBe('seen');
    expect(itemStatus({ ...netflix, amount_varies: true }, t, NOW).status).toBe('seen');
  });
  it('is due soon within a week and late three days after', () => {
    expect(itemStatus(phone, [], NOW)).toMatchObject({ status: 'due-soon', daysUntil: 4 });
    expect(itemStatus(netflix, [], NOW).status).toBe('late');
    expect(itemStatus({ ...netflix, day_of_month: 25 }, [], NOW).status).toBe('upcoming');
    expect(itemStatus({ ...netflix, status: 'paused' }, [], NOW).status).toBe('paused');
  });
  it('totals per month and lists what needs attention, most urgent first', () => {
    const s = summarize([netflix, phone, prime, { ...rent, autolog: false }, { ...netflix, id: 'd', status: 'dismissed' }], txs, NOW);
    expect(s.perMonth).toBeCloseTo(15.49 + 80 + 139 / 12 + 1400);
    expect(s.rows.map((r) => [r.item.id, r.status])).toEqual([['r', 'late'], ['p', 'due-soon'], ['a', 'upcoming'], ['n', 'seen']]);
    expect(s.upcoming.map((r) => r.item.id)).toEqual(['r', 'p']);
  });
});

describe('auto-logging', () => {
  const lines = [{ id: 'home', category: '🏠 Housing' }];
  it('logs a due item with no charge, once per cycle', () => {
    const [tx] = dueAutologs([rent, netflix], [], lines, NOW);
    expect(tx).toMatchObject({ amount: 1400, merchant: 'Rent', date: '2026-10-01', budget_line_id: 'home', category: '🏠 Housing', import_id: 'rec:r:2026-10', source: 'recurring' });
    expect(dueAutologs([rent], [tx], lines, NOW)).toEqual([]);
  });
  it('does not log when the real charge already came in, or before the due date', () => {
    expect(dueAutologs([rent], [{ id: 'x', date: '2026-10-02', amount: 1400, merchant: 'Rent payment' }], lines, NOW)).toEqual([]);
    expect(dueAutologs([{ ...rent, day_of_month: 20 }], [], lines, NOW)).toEqual([]);
  });
});

describe('spotting recurring charges', () => {
  const tx = (date, amount, merchant, extra = {}) => ({ date, amount, merchant, ...extra });
  const history = [
    tx('2026-08-09', 15.49, 'Netflix', { budget_line_id: 'subs' }), tx('2026-09-09', 15.49, 'Netflix', { budget_line_id: 'subs' }), tx('2026-10-10', 15.49, 'Netflix'),
    tx('2026-09-18', 78.12, 'Verizon'), tx('2026-10-17', 82.4, 'Verizon'),
    // groceries: several a month, not a subscription
    tx('2026-09-02', 60, 'Kroger'), tx('2026-09-15', 80, 'Kroger'), tx('2026-10-03', 70, 'Kroger'), tx('2026-10-12', 65, 'Kroger'),
    // once only
    tx('2026-10-05', 300, 'Best Buy'),
    // same merchant, very different days
    tx('2026-09-02', 20, 'Shell'), tx('2026-10-25', 20, 'Shell'),
  ];
  it('finds monthly charges and suggests amount, day and line', () => {
    const s = detectRecurring(history, [], NOW);
    expect(s.map((x) => x.merchant_pattern)).toEqual(['NETFLIX', 'VERIZON']);
    expect(s[0]).toMatchObject({ name: 'Netflix', amount: 15.49, amount_varies: false, day_of_month: 9, budget_line_id: 'subs', seenMonths: 3 });
    expect(s[1]).toMatchObject({ amount: 82.4, amount_varies: true, day_of_month: 18 });
  });
  it('skips merchants already tracked or dismissed', () => {
    const s = detectRecurring(history, [{ ...netflix, status: 'dismissed' }], NOW);
    expect(s.map((x) => x.merchant_pattern)).toEqual(['VERIZON']);
  });
});
