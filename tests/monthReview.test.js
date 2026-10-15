import { describe, expect, it } from 'vitest';
import { budgetSuggestions, monthReview } from '../src/lib/monthReview.js';

const lines = [
  { id: 'groc', label: 'Groceries', amount: 600, is_variable: true },
  { id: 'gas', label: 'Gas', amount: 150, is_variable: true },
  { id: 'fun', label: 'Eating out', amount: 200, is_variable: true },
  { id: 'phone', label: 'Phone', amount: 80, due_day: 18 },
  { id: 'rent', label: 'Rent', amount: 1400, due_day: 1 },
];
const tx = (date, amount, line) => ({ date, amount, budget_line_id: line });
const TXS = [
  tx('2026-07-05', 640, 'groc'), tx('2026-08-05', 690, 'groc'), tx('2026-09-05', 700, 'groc'),
  tx('2026-07-06', 140, 'gas'), tx('2026-08-06', 150, 'gas'), tx('2026-09-06', 148, 'gas'),
  tx('2026-09-07', 60, 'fun'),
  tx('2026-09-18', 92.5, 'phone'), tx('2026-09-01', 1400, 'rent'),
  { date: '2026-09-09', amount: 45, budget_line_id: null }, // unassigned
];

describe('month review', () => {
  const r = monthReview('2026-09', { lines, transactions: TXS, kidExpenses: [{ date: '2026-09-02', amount: 30 }], income: 3000 });

  it('totals the month', () => {
    expect(r.totalSpent).toBeCloseTo(700 + 148 + 60 + 92.5 + 1400 + 45 + 30);
    expect(r.unassigned).toBe(45);
    expect(r.family).toBe(30);
    expect(r.leftOver).toBeCloseTo(3000 - r.totalSpent);
  });

  it('lists the biggest overspends and the most left over', () => {
    expect(r.over.map((x) => [x.line.id, x.diff])).toEqual([['groc', -100], ['phone', -12.5]]);
    expect(r.under.map((x) => x.line.id)).toEqual(['fun', 'gas']);
    expect(r.linesOver).toBe(2);
  });

  it('counts rollover carried into the month', () => {
    const c = monthReview('2026-09', { lines, transactions: TXS, carry: { groc: 120 } });
    expect(c.rows.find((x) => x.line.id === 'groc').diff).toBe(20);
  });
});

describe('suggestions for next month', () => {
  it('raises a flexible line to its three-month average and updates a bill that changed', () => {
    const s = budgetSuggestions('2026-09', lines, TXS);
    expect(s.map((x) => [x.line.id, x.current, x.suggested])).toEqual([
      ['groc', 600, 680], // (640+690+700)/3 = 676.67, up to 680
      ['fun', 200, 20], // 60 over three months = 20
      ['phone', 80, 93],
    ]);
  });

  it('leaves lines alone when they are close, and ignores months before any data', () => {
    const s = budgetSuggestions('2026-07', lines, TXS);
    // Only July has data: groceries 640 against 600 is under the 10% ($60) needed.
    expect(s.find((x) => x.line.id === 'groc')).toBeUndefined();
    expect(s.find((x) => x.line.id === 'gas')).toBeUndefined();
  });
});
