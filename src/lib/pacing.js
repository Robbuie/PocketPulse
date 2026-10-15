// "Left to spend": how each budget line is doing part way through the month.
//
// Lines come in two kinds. A bill (fixed amount, due on a day) is either paid
// or not yet. A flexible line (groceries, gas, eating out: anything marked
// variable, or with no due day) is spent through the month, so it gets a
// daily allowance and a check on whether spending is running ahead of the
// calendar.

const WATCH_SHARE = 0.8; // 80% of the line used
const AHEAD_MARGIN = 1.15; // spending 15% ahead of the share of the month gone
const PAID_SHARE = 0.9; // a bill counts as paid at 90% of its amount
const DUE_SOON_DAYS = 3;

export function lineKind(line) {
  return line.is_variable || !line.due_day ? 'flex' : 'bill';
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// One flexible line. day is today's date in the month (1-based), days the
// length of the month. Money is rounded to cents only for display, elsewhere.
export function paceFlex({ budgeted, spent, day, days }) {
  const left = budgeted - spent;
  const daysLeft = days - day + 1; // today still counts
  const share = budgeted > 0 ? spent / budgeted : 0;
  const expected = budgeted * (day / days);
  let status = 'ok';
  if (spent > budgeted) status = 'over';
  else if (share >= WATCH_SHARE) status = 'watch';
  else if (spent > 0 && expected > 0 && spent > expected * AHEAD_MARGIN) status = 'ahead';
  return {
    budgeted,
    spent,
    left,
    share,
    expected,
    daysLeft,
    perDay: left > 0 ? left / daysLeft : 0,
    status,
  };
}

export function paceBill({ budgeted, spent, dueDay, day }) {
  const paid = budgeted > 0 ? spent >= budgeted * PAID_SHARE : spent > 0;
  let status = paid ? 'paid' : 'upcoming';
  if (!paid && dueDay < day) status = 'late';
  else if (!paid && dueDay - day <= DUE_SOON_DAYS) status = 'due-soon';
  return { budgeted, spent, dueDay, paid, status };
}

const FLEX_ORDER = { over: 0, watch: 1, ahead: 2, ok: 3 };
const BILL_ORDER = { late: 0, 'due-soon': 1, upcoming: 2, paid: 3 };

// The whole month for Home: every line with an amount, flexible lines
// most urgent first, bills by urgency then due day, and the flexible totals.
// carry: rollover carried in per line id (see rollover.js), added to what a
// flexible line has this month.
export function monthPace(lines, spentMap, now = new Date(), carry = {}) {
  const day = now.getDate();
  const days = daysInMonth(now.getFullYear(), now.getMonth());
  const flex = [];
  const bills = [];
  for (const line of lines || []) {
    const budgeted = parseFloat(line.amount) || 0;
    if (budgeted <= 0) continue;
    const spent = spentMap[line.id] || 0;
    if (lineKind(line) === 'bill') bills.push({ line, ...paceBill({ budgeted, spent, dueDay: Number(line.due_day), day }) });
    else {
      const carried = carry[line.id] || 0;
      flex.push({ line, carried, ...paceFlex({ budgeted: Math.max(0, budgeted + carried), spent, day, days }) });
    }
  }
  flex.sort((a, b) => FLEX_ORDER[a.status] - FLEX_ORDER[b.status] || a.left / (a.budgeted || 1) - b.left / (b.budgeted || 1));
  bills.sort((a, b) => BILL_ORDER[a.status] - BILL_ORDER[b.status] || a.dueDay - b.dueDay);

  const flexBudget = flex.reduce((s, x) => s + x.budgeted, 0);
  const flexSpent = flex.reduce((s, x) => s + x.spent, 0);
  // Over-spending on one line is not money available on another, so the
  // total left only counts what each line still has.
  const flexLeft = flex.reduce((s, x) => s + Math.max(0, x.left), 0);
  const flexOver = flex.reduce((s, x) => s + Math.max(0, -x.left), 0);
  const daysLeft = days - day + 1;
  return {
    day,
    days,
    daysLeft,
    flex,
    bills,
    totals: {
      flexBudget,
      flexSpent,
      flexLeft,
      flexOver,
      perDay: flexLeft / daysLeft,
      billsPaid: bills.filter((b) => b.paid).length,
      billsCount: bills.length,
      billsUnpaidAmount: bills.filter((b) => !b.paid).reduce((s, b) => s + Math.max(0, b.budgeted - b.spent), 0),
    },
  };
}
