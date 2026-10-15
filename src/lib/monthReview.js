// The month-end review: how a month went against the budget, and suggested
// amounts for next month from what was actually spent.
import { spentByLine } from './budget';
import { lineKind } from './pacing';
import { monthsBetween } from './rollover';

const ceil5 = (n) => Math.ceil(n / 5) * 5;

function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// carry: rollover carried into `month`, per line id (rollover.js).
export function monthReview(month, { lines = [], transactions = [], kidExpenses = [], income = 0, carry = {} }) {
  const spent = spentByLine(transactions, month);
  const rows = lines
    .map((line) => {
      const budgeted = Math.max(0, (parseFloat(line.amount) || 0) + (carry[line.id] || 0));
      const s = spent[line.id] || 0;
      return { line, kind: lineKind(line), budgeted, spent: s, diff: budgeted - s };
    })
    .filter((r) => r.budgeted > 0 || r.spent > 0);

  const inMonth = transactions.filter((t) => t.date?.startsWith(month));
  const unassigned = inMonth.filter((t) => !t.budget_line_id).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
  const family = kidExpenses.filter((k) => k.date?.startsWith(month)).reduce((s, k) => s + (parseFloat(k.amount) || 0), 0);
  const totalSpent = inMonth.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) + family;
  const budgeted = rows.reduce((s, r) => s + r.budgeted, 0);

  return {
    month,
    rows,
    budgeted,
    totalSpent,
    unassigned,
    family,
    income,
    leftOver: income - totalSpent,
    over: rows.filter((r) => r.diff < -0.005).sort((a, b) => a.diff - b.diff).slice(0, 3),
    under: rows.filter((r) => r.kind === 'flex' && r.diff > 0.005).sort((a, b) => b.diff - a.diff).slice(0, 3),
    linesOver: rows.filter((r) => r.diff < -0.005).length,
  };
}

// New amounts worth considering, from the month reviewed and the two before
// it. A flexible line is suggested its three-month average, rounded up to
// $5, when that is at least $10 and 10% away from today's amount. A bill is
// suggested what it actually came to this month when that changed by $5 or
// more (a phone bill that went up). Months before the household's first
// transaction are left out of the average.
export function budgetSuggestions(month, lines, transactions) {
  const first = (transactions || []).reduce((min, t) => (t.date && (!min || t.date < min) ? t.date : min), null);
  if (!first) return [];
  const months = monthsBetween(shiftMonth(month, -2), shiftMonth(month, 1)).filter((m) => m >= first.slice(0, 7));
  const perMonth = months.map((m) => spentByLine(transactions, m));
  const out = [];
  for (const line of lines || []) {
    const current = parseFloat(line.amount) || 0;
    if (lineKind(line) === 'flex') {
      const avg = perMonth.reduce((s, sp) => s + (sp[line.id] || 0), 0) / months.length;
      if (avg <= 0) continue;
      const suggested = ceil5(avg);
      if (Math.abs(suggested - current) >= Math.max(10, current * 0.1)) {
        out.push({ line, current, suggested, reason: `averaged ${Math.round(avg)} a month over ${months.length} month${months.length === 1 ? '' : 's'}` });
      }
    } else {
      const actual = perMonth[perMonth.length - 1][line.id] || 0;
      if (actual > 0 && Math.abs(actual - current) >= 5) {
        out.push({ line, current, suggested: Math.round(actual), reason: `came to ${actual.toFixed(2)} this month` });
      }
    }
  }
  return out;
}
