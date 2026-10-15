// Reading a downloaded statement file into statement lines.
import { parseCsv } from './csv.js';
import { detectMapping, headerSignature, mappingIsComplete, ofxToEntries, toEntries } from './layouts.js';
import { looksLikeOfx, parseOfx } from './ofx.js';

function last4(s) {
  const d = String(s ?? '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : '';
}

// profiles: saved mappings for this household ({signature, name, mapping}).
// Returns { kind, entries, account, mapping?, rows?, headers?, signature?,
// needsMapping, error? }.
export function readStatement(text, fileName = '', profiles = []) {
  if (looksLikeOfx(text)) {
    const parsed = parseOfx(text);
    const isCard = /CREDIT/i.test(parsed.account.type);
    const tail = last4(parsed.account.id);
    const account = `${isCard ? 'Card' : 'Bank'}${tail ? ` ...${tail}` : ''}`;
    if (!parsed.transactions.length) return { kind: 'ofx', entries: [], account, needsMapping: false, error: 'No transactions found in this file.' };
    return { kind: 'ofx', entries: ofxToEntries(parsed), account, needsMapping: false };
  }

  const rows = parseCsv(text);
  const detected = detectMapping(rows);
  if (!detected) {
    return { kind: 'csv', entries: [], rows, account: '', needsMapping: false, error: 'This does not look like a bank statement: no header row with a date column was found. Download it as CSV, QFX or OFX.' };
  }
  const headers = rows[detected.headerRow];
  const signature = headerSignature(headers);
  const saved = profiles.find((p) => p.signature === signature);
  const mapping = saved ? { ...detected, ...saved.mapping, headerRow: detected.headerRow } : detected;

  let account = saved?.name || mapping.name || fileName.replace(/\.[^.]+$/, '');
  if (mapping.name === 'Capital One' && !saved) {
    const cardCol = headers.findIndex((h) => /card no/i.test(h));
    const tail = cardCol >= 0 ? last4(rows[detected.headerRow + 1]?.[cardCol]) : '';
    account = `Capital One${tail ? ` ...${tail}` : ''}`;
  }

  const complete = mappingIsComplete(mapping);
  return {
    kind: 'csv',
    rows,
    headers,
    signature,
    mapping,
    account,
    // Known and saved layouts go straight to the preview; guessed ones are
    // shown for a check first.
    needsMapping: !complete || (!mapping.known && !saved),
    entries: complete ? toEntries(rows, mapping) : [],
  };
}

export { toEntries };
