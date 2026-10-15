// Working out which column of a bank CSV is which.
//
// A mapping says where the header row is, which columns hold the date,
// description and money, and how money is written: one signed amount column
// (and whether spending is the negative or the positive side), or separate
// debit and credit columns. Known layouts are recognized by their headers;
// anything else is guessed from header names and shown to the user to
// confirm. A confirmed mapping is saved per header signature.
import { parseAmount, parseDate } from './values.js';

// Capital One credit card CSV, as downloaded from the website.
const CAPITAL_ONE = ['transaction date', 'posted date', 'card no.', 'description', 'category', 'debit', 'credit'];

const norm = (h) => String(h ?? '').trim().toLowerCase();

export function headerSignature(headers) {
  return headers.map(norm).join('|');
}

// The first row, within the first few, that looks like a header: at least
// three cells and one of them naming a date. Some banks put account details
// above it.
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    if (r.length >= 3 && r.some((c) => /date/i.test(c)) && !r.some((c) => parseDate(c))) return i;
  }
  return -1;
}

function find(headers, ...patterns) {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

export function detectMapping(rows) {
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) return null;
  const headers = rows[headerRow].map(norm);

  if (CAPITAL_ONE.every((h) => headers.includes(h))) {
    return {
      name: 'Capital One',
      known: true,
      headerRow,
      date: headers.indexOf('transaction date'),
      description: headers.indexOf('description'),
      memo: -1,
      category: headers.indexOf('category'),
      amountMode: 'split',
      amount: -1,
      debit: headers.indexOf('debit'),
      credit: headers.indexOf('credit'),
      spendIs: 'debit',
    };
  }

  const date = find(headers, /^trans(action)?\.? ?date$/, /^date$/, /^(post(ed|ing)?) ?date$/, /date/);
  const description = find(headers, /^description$/, /payee/, /merchant/, /^name$/, /description|details|transaction$/);
  const memo = find(headers, /memo/);
  const category = find(headers, /category/);
  const debit = find(headers, /^debit/, /withdrawal/, /money out/, /^charge/);
  const credit = find(headers, /^credit/, /deposit/, /money in/);
  const amount = find(headers, /^amount$/, /amount/);

  const mapping = {
    name: '',
    known: false,
    headerRow,
    date,
    description,
    memo: memo === description ? -1 : memo,
    category,
    amountMode: debit >= 0 && credit >= 0 ? 'split' : 'signed',
    amount,
    debit,
    credit,
    spendIs: 'negative',
  };

  // With one signed column, banks write spending as negative; some card
  // exports write charges as positive. Most rows in a statement are
  // spending, so whichever sign dominates is taken as spending.
  if (mapping.amountMode === 'signed' && amount >= 0) {
    const values = rows.slice(headerRow + 1).map((r) => parseAmount(r[amount])).filter((v) => v);
    const positive = values.filter((v) => v > 0).length;
    if (values.length && positive / values.length > 0.6) mapping.spendIs = 'positive';
  }
  return mapping;
}

export function mappingIsComplete(m) {
  if (!m || m.date < 0 || m.description < 0) return false;
  return m.amountMode === 'split' ? m.debit >= 0 || m.credit >= 0 : m.amount >= 0;
}

// Statement lines from the rows. outflow is positive for money out
// (spending) and negative for money in (refunds, deposits, payments).
export function toEntries(rows, m) {
  const out = [];
  for (let i = m.headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(r[m.date]);
    if (!date) continue;
    let outflow;
    if (m.amountMode === 'split') {
      const debit = m.debit >= 0 ? parseAmount(r[m.debit]) : null;
      const credit = m.credit >= 0 ? parseAmount(r[m.credit]) : null;
      if (debit == null && credit == null) continue;
      outflow = Math.abs(debit || 0) - Math.abs(credit || 0);
    } else {
      const a = parseAmount(r[m.amount]);
      if (a == null) continue;
      outflow = m.spendIs === 'positive' ? a : -a;
    }
    if (outflow === 0) continue;
    const memo = m.memo >= 0 ? r[m.memo] || '' : '';
    out.push({
      date,
      description: r[m.description] || memo || '(no description)',
      memo,
      bankCategory: m.category >= 0 ? r[m.category] || '' : '',
      outflow: Math.round(outflow * 100) / 100,
      fitid: '',
    });
  }
  return out;
}

// OFX transactions as statement lines. Credit card and bank files both
// write money out as negative.
export function ofxToEntries(parsed) {
  return parsed.transactions
    .filter((t) => t.amount !== 0)
    .map((t) => ({
      date: t.date,
      description: t.name || t.memo || '(no description)',
      memo: t.memo && t.memo !== t.name ? t.memo : '',
      bankCategory: '',
      outflow: -t.amount,
      fitid: t.fitid,
    }));
}
