// Recurring charges: bills and subscriptions expected every month or year.
//
// An item says what to expect (name, amount, day, monthly or yearly) and how
// to recognize it in transactions (a merchant pattern, as in merchant rules).
// Each period ("cycle") it is seen, coming up, due soon, or late. Items set
// to auto-log are entered as transactions on their due date when no matching
// charge has arrived; the transaction's import_id "rec:<item>:<cycle>" is
// unique per household, so two phones logging at once save it once.
import { localDate, monthKey } from './format';
import { matchesPattern, merchantKey } from './import/merchant';

const MATCH_WINDOW_DAYS = 7; // a charge counts within a week either side of the due date
const LATE_AFTER_DAYS = 3;
const SOON_DAYS = 7;
const AMOUNT_TOLERANCE = 0.15;

const DAY = 86400000;
const dateOf = (iso) => new Date(`${iso}T00:00:00`);
const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / DAY);

function dueIn(year, monthIndex, day) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return localDate(new Date(year, monthIndex, Math.min(Math.max(1, day), last)));
}

// The period that matters today: this month's charge for a monthly item,
// and this year's for a yearly one until a month after its date, after
// which next year's is shown.
export function cycleFor(item, now = new Date()) {
  const day = Number(item.day_of_month) || 1;
  if (item.cadence === 'yearly') {
    const month = (Number(item.month_of_year) || 1) - 1;
    let year = now.getFullYear();
    let due = dueIn(year, month, day);
    if (daysBetween(due, localDate(now)) > 31) { year += 1; due = dueIn(year, month, day); }
    return { key: String(year), due };
  }
  return { key: monthKey(now), due: dueIn(now.getFullYear(), now.getMonth(), day) };
}

function amountMatches(item, amount) {
  if (item.amount_varies) return amount > 0;
  const want = parseFloat(item.amount) || 0;
  return Math.abs(amount - want) <= Math.max(1, want * AMOUNT_TOLERANCE);
}

// The transaction that paid this cycle, if any: logged automatically for
// this cycle, or a charge from the merchant near the due date.
export function findPayment(item, cycle, transactions) {
  const autoId = `rec:${item.id}:${cycle.key}`;
  let best = null;
  for (const t of transactions || []) {
    if (t.import_id === autoId) return t;
    const amount = parseFloat(t.amount) || 0;
    if (!t.date || Math.abs(daysBetween(cycle.due, t.date)) > MATCH_WINDOW_DAYS) continue;
    const text = `${t.merchant || ''} ${t.description || ''}`;
    if (!matchesPattern(item.merchant_pattern || item.name, text)) continue;
    if (!amountMatches(item, amount)) continue;
    if (!best || Math.abs(daysBetween(cycle.due, t.date)) < Math.abs(daysBetween(cycle.due, best.date))) best = t;
  }
  return best;
}

export function itemStatus(item, transactions, now = new Date()) {
  const cycle = cycleFor(item, now);
  if (item.status === 'paused') return { item, cycle, payment: null, status: 'paused' };
  const payment = findPayment(item, cycle, transactions);
  const until = daysBetween(localDate(now), cycle.due);
  let status = 'upcoming';
  if (payment) status = 'seen';
  else if (until < -LATE_AFTER_DAYS) status = 'late';
  else if (until <= SOON_DAYS) status = 'due-soon';
  return { item, cycle, payment, status, daysUntil: until };
}

export function monthlyCost(item) {
  const amount = parseFloat(item.amount) || 0;
  return item.cadence === 'yearly' ? amount / 12 : amount;
}

// Active items only (not paused, not dismissed suggestions).
export const activeItems = (items) => (items || []).filter((i) => i.status === 'active');

export function summarize(items, transactions, now = new Date()) {
  const active = activeItems(items);
  const rows = active.map((i) => itemStatus(i, transactions, now));
  const order = { late: 0, 'due-soon': 1, upcoming: 2, seen: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.cycle.due.localeCompare(b.cycle.due));
  const perMonth = active.reduce((s, i) => s + monthlyCost(i), 0);
  return {
    rows,
    perMonth,
    perYear: perMonth * 12,
    // Due in the next week (or late), not yet seen: what Home lists.
    upcoming: rows.filter((r) => r.status === 'late' || r.status === 'due-soon'),
  };
}

// Transactions to save for auto-logged items whose due date has come with
// no matching charge.
export function dueAutologs(items, transactions, lines = [], now = new Date()) {
  const today = localDate(now);
  const out = [];
  for (const item of activeItems(items)) {
    if (!item.autolog) continue;
    const cycle = cycleFor(item, now);
    if (cycle.due > today) continue;
    if (findPayment(item, cycle, transactions)) continue;
    const line = lines.find((l) => l.id === item.budget_line_id);
    out.push({
      amount: parseFloat(item.amount) || 0,
      merchant: item.name,
      description: 'Logged automatically on its due date',
      category: line?.category || '🧾 Other',
      budget_line_id: line ? line.id : null,
      date: cycle.due,
      items: null,
      import_id: `rec:${item.id}:${cycle.key}`,
      source: 'recurring',
      account: null,
    });
  }
  return out;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Charges that look monthly: the same merchant in at least two of the last
// four months, about once a month, at a similar amount and day. Merchants
// already covered by an item (active, paused or dismissed) are skipped.
export function detectRecurring(transactions, items = [], now = new Date()) {
  const since = localDate(new Date(now.getFullYear(), now.getMonth() - 3, 1));
  const byMerchant = new Map();
  for (const t of transactions || []) {
    const amount = parseFloat(t.amount) || 0;
    if (amount <= 0 || !t.date || t.date < since || t.source === 'recurring') continue;
    const key = merchantKey(t.merchant || t.description);
    if (!key) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push(t);
  }

  const covered = (key) => (items || []).some((i) => matchesPattern(i.merchant_pattern || i.name, key));
  const out = [];
  for (const [key, txs] of byMerchant) {
    if (covered(key)) continue;
    const months = new Set(txs.map((t) => t.date.slice(0, 7)));
    if (months.size < 2 || txs.length / months.size > 1.25) continue;
    const amounts = txs.map((t) => parseFloat(t.amount));
    const mid = median(amounts);
    if (amounts.some((a) => Math.abs(a - mid) > Math.max(1, mid * AMOUNT_TOLERANCE))) continue;
    const days = txs.map((t) => Number(t.date.slice(8, 10)));
    const midDay = median(days);
    if (days.some((d) => Math.abs(d - midDay) > 6)) continue;
    const lineCounts = new Map();
    for (const t of txs) if (t.budget_line_id) lineCounts.set(t.budget_line_id, (lineCounts.get(t.budget_line_id) || 0) + 1);
    const line = [...lineCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const latest = [...txs].sort((a, b) => b.date.localeCompare(a.date))[0];
    out.push({
      name: latest.merchant || key,
      merchant_pattern: key,
      amount: Math.round(parseFloat(latest.amount) * 100) / 100,
      amount_varies: amounts.some((a) => Math.abs(a - mid) > 0.01),
      cadence: 'monthly',
      day_of_month: Math.round(midDay),
      budget_line_id: line,
      seenMonths: months.size,
    });
  }
  return out.sort((a, b) => b.seenMonths - a.seenMonths || b.amount - a.amount);
}
