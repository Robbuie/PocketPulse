// Recognizing merchants in bank descriptions, and the household's rules that
// send a merchant to a budget line.

// Prefixes banks put in front of the merchant name.
const NOISE_PREFIX = /^(?:(?:POS|DBT|DEBIT|CHECK ?CARD|CARD|PURCHASE|RECURRING|ACH|ONLINE|ELECTRONIC|PREAUTHORIZED|PRE-AUTH|VISA|MC|WITHDRAWAL|CRD|PMT|TRANSACTION)\b[\s:-]*)+/;
// Payment processors that put the merchant after an asterisk.
const PROCESSOR = /^(?:SQ|TST|SP|PAYPAL|PP|PY|GOOGLE|DD|IC|EB|LYFT|UBER)\s*\*\s*/;

// A short, stable name for a merchant: "KROGER #0123 DETROIT MI" -> "KROGER",
// "SQ *BLUE BOTTLE COFFEE" -> "BLUE BOTTLE COFFEE", "AMAZON.COM*AB12CD AMZN.COM/BILL"
// -> "AMAZON". Cut at the first word containing a digit (store numbers,
// reference codes), keep at most three words.
export function merchantKey(description) {
  let s = String(description ?? '').toUpperCase().trim();
  s = s.replace(NOISE_PREFIX, '');
  const proc = PROCESSOR.exec(s);
  if (proc) s = s.slice(proc[0].length);
  else if (s.includes('*')) s = s.slice(0, s.indexOf('*'));
  s = s.split('#')[0];
  s = s.replace(/\.(COM|NET|ORG|CO)\b/g, ''); // NETFLIX.COM -> NETFLIX
  s = s.replace(/[^A-Z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = [];
  for (const w of s.split(' ')) {
    if (!w || /\d/.test(w)) break;
    words.push(w);
    if (words.length === 3) break;
  }
  return words.join(' ');
}

const normalizeText = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9&' ]+/g, ' ').replace(/\s+/g, ' ').trim();

// The rule for this description, or null. A rule's pattern is a merchant key
// (as above) or any text; it matches when the description's key equals it or
// starts with it, or the whole description contains it. The longest matching
// pattern wins, so "AMAZON PRIME" beats "AMAZON".
export function matchRule(rules, description) {
  const key = merchantKey(description);
  const text = normalizeText(description);
  let best = null;
  for (const r of rules || []) {
    const p = normalizeText(r.pattern);
    if (!p) continue;
    const hit = key === p || key.startsWith(p + ' ') || ` ${text} `.includes(` ${p} `);
    if (hit && (!best || p.length > normalizeText(best.pattern).length)) best = r;
  }
  return best;
}

// Money moving between accounts rather than being spent: card payments,
// transfers, peer payments, cash. Imported unticked with this reason; the
// user can tick any that really were spending.
const TRANSFER_PATTERNS = [
  [/\b(AUTOPAY|AUTO PAY|PAYMENT THANK YOU|ONLINE PAYMENT|MOBILE PMT|MOBILE PAYMENT|EPAY|CRCARDPMT|CARD PMT|PAYMENT TO)\b/, 'card payment'],
  [/\bCAPITAL ONE\b.*\b(PMT|PYMT|PAYMENT|ONLINE)\b/, 'card payment'],
  [/\b(TRANSFER|XFER|TRNSFR)\b/, 'transfer'],
  [/\b(ZELLE|VENMO|CASH APP|SQUARE CASH|PAYPAL TRANSFER)\b/, 'person-to-person payment'],
  [/\b(ATM|CASH WITHDRAWAL)\b/, 'cash withdrawal'],
];

export function transferReason(description) {
  const s = normalizeText(description);
  for (const [re, reason] of TRANSFER_PATTERNS) if (re.test(s)) return reason;
  return null;
}

// Capital One's own category names, mapped to the app's categories, for
// lines that no rule or budget line claims.
const BANK_CATEGORY = [
  [/dining|restaurant/i, '🍽️ Restaurants & Dining'],
  [/grocer/i, '🛒 Groceries'],
  [/gas|automotive|fuel/i, '⛽ Gas & Fuel'],
  [/health|medical|pharmacy/i, '❤️ Healthcare'],
  [/phone|cable|internet|utilit/i, '⚡ Utilities'],
  [/airfare|lodging|travel|car rental/i, '✈️ Travel'],
  [/entertainment/i, '🎉 Entertainment'],
  [/insurance/i, '🛡 Insurance'],
  [/education/i, '📚 Education'],
];

export function categoryFromBank(bankCategory) {
  for (const [re, cat] of BANK_CATEGORY) if (re.test(bankCategory || '')) return cat;
  return null;
}
