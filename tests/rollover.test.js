import { describe, expect, it } from 'vitest';
import { carryover, monthsBetween } from '../src/lib/rollover.js';
import { monthPace } from '../src/lib/pacing.js';

describe('rollover', () => {
  it('lists the months in between', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthsBetween('2026-10', '2026-10')).toEqual([]);
  });

  const lines = [
    { id: 'groc', amount: 600, is_variable: true, rollover: true, rollover_from: '2026-08' },
    { id: 'fun', amount: 150, is_variable: true, rollover: true, rollover_from: '2026-10' }, // switched on this month
    { id: 'gas', amount: 200, is_variable: true }, // no rollover
  ];
  const txs = [
    { date: '2026-07-10', amount: 900, budget_line_id: 'groc' }, // before rollover was on: ignored
    { date: '2026-08-10', amount: 550, budget_line_id: 'groc' }, // 50 under
    { date: '2026-09-10', amount: 680, budget_line_id: 'groc' }, // 80 over
    { date: '2026-09-12', amount: 100, budget_line_id: 'gas' },
  ];

  it('carries unspent money forward and takes overspending back, from when it was switched on', () => {
    expect(carryover(lines, txs, '2026-10')).toEqual({ groc: -30 });
    expect(carryover(lines, txs, '2026-11')).toEqual({ groc: 570, fun: 150 }); // October had nothing spent yet
  });

  it('adds the carry to what a line has this month', () => {
    const p = monthPace(lines, { groc: 100 }, new Date(2026, 9, 16), { groc: -30 });
    const groc = p.flex.find((x) => x.line.id === 'groc');
    expect(groc).toMatchObject({ budgeted: 570, carried: -30, left: 470 });
  });
});
