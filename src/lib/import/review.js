// Turning statement lines into the rows of the import preview: what is new,
// what was imported before, what looks like something already entered by
// hand, what is a transfer or money in, and which budget line each goes to.
import { guessItemBudgetLine } from '../budget.js';
import { categoryFromBank, matchRule, merchantKey, transferReason } from './merchant.js';

const OTHER = '🧾 Other';
const DUPLICATE_DAYS = 3;

// FNV-1a, 32 bit, as hex. Only needs to be stable, not secure.
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function accountKey(label) {
  return String(label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'account';
}

// A stable id for a statement line, so importing the same file twice, or two
// exports with overlapping dates, adds nothing the second time. OFX lines
// carry the bank's own id. CSV lines are identified by date, amount and
// description, plus a count for identical lines on the same day (two
// coffees), which comes out the same in any export containing that day.
export function importIds(entries, account) {
  const acct = accountKey(account);
  const seen = new Map();
  return entries.map((e) => {
    if (e.fitid) return `ofx:${acct}:${e.fitid}`;
    // The raw description, not the merchant key, so that improving how keys
    // are worked out never changes ids of lines already imported.
    const base = `${e.date}:${e.outflow.toFixed(2)}:${hash(e.description.toUpperCase().replace(/\s+/g, ' ').trim())}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return `csv:${acct}:${base}:${n}`;
  });
}

function daysBetween(a, b) {
  return Math.abs((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);
}

export function titleCase(s) {
  return String(s ?? '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// entries: statement lines. existing: transactions already saved around those
// dates ({id, date, amount, merchant, import_id}). rules: merchant rules.
// lines: budget lines ({id, label, category}).
export function buildReview(entries, { account, existing = [], rules = [], lines = [] }) {
  const ids = importIds(entries, account);
  const imported = new Set(existing.map((t) => t.import_id).filter(Boolean));
  // Entered by hand, or logged automatically by a recurring item (0.8.0):
  // either may be the same charge the statement now shows.
  const unmatched = existing.filter((t) => !t.import_id || t.import_id.startsWith('rec:'));
  const lineById = new Map(lines.map((l) => [l.id, l]));

  return entries.map((entry, i) => {
    const row = {
      key: i,
      entry,
      importId: ids[i],
      merchant: merchantKey(entry.description),
      include: true,
      status: 'new',
      reason: '',
      budget_line_id: '',
      lineSource: '',
      category: OTHER,
      remember: false,
    };

    const rule = matchRule(rules, entry.description);
    if (rule?.action === 'line' && lineById.has(rule.budget_line_id)) {
      row.budget_line_id = rule.budget_line_id;
      row.lineSource = 'rule';
    } else {
      const guess = guessItemBudgetLine(entry.description, lines);
      if (guess) { row.budget_line_id = guess; row.lineSource = 'guess'; }
    }
    row.category = lineById.get(row.budget_line_id)?.category || categoryFromBank(entry.bankCategory) || OTHER;

    if (imported.has(row.importId)) {
      return { ...row, include: false, status: 'imported', reason: 'already imported' };
    }
    if (entry.outflow < 0) {
      return { ...row, include: false, status: 'money-in', reason: 'money in: refund, deposit or payment' };
    }
    const transfer = transferReason(entry.description);
    if (transfer) return { ...row, include: false, status: 'transfer', reason: transfer };
    if (rule?.action === 'skip') return { ...row, include: false, status: 'skip-rule', reason: 'a rule says skip this merchant' };

    const dupIndex = unmatched.findIndex(
      (t) => Math.abs((parseFloat(t.amount) || 0) - entry.outflow) < 0.005 && daysBetween(t.date, entry.date) <= DUPLICATE_DAYS,
    );
    if (dupIndex >= 0) {
      const [t] = unmatched.splice(dupIndex, 1);
      return { ...row, include: false, status: 'possible-duplicate', reason: `looks like ${t.merchant || 'an entry'} on ${t.date}`, duplicateOf: t.id };
    }
    return row;
  });
}

// The transaction to save for a ticked row. Money in becomes a negative
// amount, which the budget counts as a refund.
export function rowToTransaction(row, account) {
  const e = row.entry;
  return {
    amount: e.outflow,
    category: row.category || OTHER,
    budget_line_id: row.budget_line_id || null,
    merchant: titleCase(row.merchant) || e.description,
    description: e.memo ? `${e.description} · ${e.memo}` : e.description,
    date: e.date,
    items: null,
    import_id: row.importId,
    source: 'import',
    account: account || null,
  };
}

// Rules to save from the preview: one per merchant whose line the user chose
// and asked to remember. The last choice for a merchant wins.
export function rulesToSave(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!r.remember || !r.merchant || !r.budget_line_id) continue;
    out.set(r.merchant, { pattern: r.merchant, action: 'line', budget_line_id: r.budget_line_id });
  }
  return [...out.values()];
}
