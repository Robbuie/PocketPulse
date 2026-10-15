// Rollover: a flexible line can carry what it did not spend into the next
// month, and an overspend comes off the next month too. The carry counts
// from the month rollover was switched on (rollover_from), so switching it
// on never drags in old history, and uses the line's current amount for
// every month, so changing the amount changes the carry from then on.
import { spentByLine } from './budget';
import { monthKey } from './format';

export function monthsBetween(from, to) {
  // "YYYY-MM" months from `from` up to, not including, `to`
  const out = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m < tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return out;
}

// Carry into `month` for every rollover line, keyed by line id.
export function carryover(lines, transactions, month = monthKey()) {
  const carry = {};
  const rolling = (lines || []).filter((l) => l.rollover && l.rollover_from && l.rollover_from < month);
  if (!rolling.length) return carry;
  const earliest = rolling.reduce((min, l) => (l.rollover_from < min ? l.rollover_from : min), month);
  const spentByMonth = new Map(monthsBetween(earliest, month).map((m) => [m, spentByLine(transactions, m)]));
  for (const line of rolling) {
    const budgeted = parseFloat(line.amount) || 0;
    let total = 0;
    for (const m of monthsBetween(line.rollover_from, month)) total += budgeted - (spentByMonth.get(m)[line.id] || 0);
    carry[line.id] = Math.round(total * 100) / 100;
  }
  return carry;
}
