import { describe, expect, it } from 'vitest';
import { spentByLine } from '../src/lib/budget.js';
import { lineKind, monthPace, paceBill, paceFlex } from '../src/lib/pacing.js';
import { loadLegacyBlock } from './legacy.js';

describe('spending per budget line', () => {
  // The calculation the Budget screen used before 0.7.0, taken from the
  // deployed file. Home and Budget must still agree with it.
  const legacySpent = loadLegacyBlock('const actualByLineId=useMemo(()=>{', '},[transactions,thisMonth]);', ['transactions', 'thisMonth']);

  const TXS = [
    { date: '2026-10-02', amount: 50, budget_line_id: 'groc' },
    { date: '2026-10-03', amount: 20, budget_line_id: null, category: 'x' },
    { date: '2026-09-30', amount: 99, budget_line_id: 'groc' },
    { date: '2026-10-05', amount: -10, budget_line_id: 'groc' }, // refund
    // a receipt split: 30 total, 12 of it household supplies, 3 left out
    { date: '2026-10-06', amount: 30, budget_line_id: 'groc', items: [
      { price: 15 }, { price: 12, budget_line_id: 'house' }, { price: 3, budget_line_id: 'house', included: false },
    ] },
  ];

  it('matches the deployed app', () => {
    expect(spentByLine(TXS, '2026-10')).toEqual(legacySpent(TXS, '2026-10'));
  });

  it('counts refunds, splits receipts and ignores other months and unlinked spending', () => {
    expect(spentByLine(TXS, '2026-10')).toEqual({ groc: 58, house: 12 });
  });
});

describe('pacing a flexible line', () => {
  // Groceries $600 in a 30-day month.
  const pace = (spent, day) => paceFlex({ budgeted: 600, spent, day, days: 30 });

  it('gives what is left per day, counting today', () => {
    const p = pace(300, 16); // 15 days left including today
    expect(p.left).toBe(300);
    expect(p.daysLeft).toBe(15);
    expect(p.perDay).toBe(20);
    expect(p.status).toBe('ok');
  });

  it('is ahead of pace when spending runs well ahead of the calendar', () => {
    expect(pace(300, 10).status).toBe('ahead'); // half spent, a third of the month gone
    expect(pace(220, 10).status).toBe('ok'); // within 15% of 200 expected
  });

  it('watches at 80% and is over past 100%', () => {
    expect(pace(480, 29).status).toBe('watch');
    expect(pace(650, 20)).toMatchObject({ status: 'over', left: -50, perDay: 0 });
  });

  it('nothing spent is fine on day one', () => {
    expect(pace(0, 1)).toMatchObject({ status: 'ok', perDay: 20 });
  });
});

describe('bills', () => {
  it('is paid at 90% (a bill that came in a little lower still counts)', () => {
    expect(paceBill({ budgeted: 100, spent: 92, dueDay: 5, day: 10 }).status).toBe('paid');
  });
  it('is late after its due day, due soon within three days', () => {
    expect(paceBill({ budgeted: 100, spent: 0, dueDay: 5, day: 10 }).status).toBe('late');
    expect(paceBill({ budgeted: 100, spent: 0, dueDay: 12, day: 10 }).status).toBe('due-soon');
    expect(paceBill({ budgeted: 100, spent: 0, dueDay: 20, day: 10 }).status).toBe('upcoming');
  });
  it('variable lines and lines without a due day are flexible', () => {
    expect(lineKind({ is_variable: true, due_day: 5 })).toBe('flex');
    expect(lineKind({ due_day: null })).toBe('flex');
    expect(lineKind({ due_day: 1 })).toBe('bill');
  });
});

describe('the month on Home', () => {
  const lines = [
    { id: 'groc', label: 'Groceries', amount: 600, is_variable: true },
    { id: 'gas', label: 'Gas', amount: 200, is_variable: true },
    { id: 'fun', label: 'Eating out', amount: 150 },
    { id: 'rent', label: 'Rent', amount: 1400, due_day: 1 },
    { id: 'phone', label: 'Phone', amount: 80, due_day: 18 },
    { id: 'empty', label: 'Unused', amount: 0, is_variable: true },
  ];
  const spent = { groc: 300, gas: 210, fun: 20, rent: 1400 };
  const p = monthPace(lines, spent, new Date(2026, 9, 16)); // Oct 16, 31-day month

  it('orders flexible lines most urgent first and skips lines without an amount', () => {
    expect(p.flex.map((x) => [x.line.id, x.status])).toEqual([['gas', 'over'], ['groc', 'ok'], ['fun', 'ok']]);
  });

  it('totals only what lines still have, and splits it over the days left', () => {
    expect(p.daysLeft).toBe(16);
    expect(p.totals.flexLeft).toBe(300 + 130);
    expect(p.totals.flexOver).toBe(10);
    expect(p.totals.perDay).toBeCloseTo(430 / 16);
  });

  it('counts bills paid and what is still to come', () => {
    expect(p.bills.map((b) => [b.line.id, b.status])).toEqual([['phone', 'due-soon'], ['rent', 'paid']]);
    expect(p.totals).toMatchObject({ billsPaid: 1, billsCount: 2, billsUnpaidAmount: 80 });
  });
});
