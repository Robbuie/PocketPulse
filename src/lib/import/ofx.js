// Reads OFX, QFX (Quicken) and QBO (QuickBooks) files, which are the same
// format. Older files are SGML, where closing tags are optional; newer ones
// are XML. Both are read by taking each <STMTTRN> block and the values of the
// tags inside it, which works for either.
import { parseDate } from './values.js';

function tag(block, name) {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? decode(m[1].trim()) : '';
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function looksLikeOfx(text) {
  return /<OFX>|OFXHEADER/i.test(String(text ?? '').slice(0, 2000));
}

// Returns { account: { id, type, bankId }, transactions: [...] }. Each
// transaction: { fitid, date, amount, name, memo, type }, where amount is as
// the bank wrote it (negative is money out).
export function parseOfx(text) {
  const src = String(text ?? '');
  const account = {
    id: tag(src, 'ACCTID'),
    type: tag(src, 'ACCTTYPE') || (/<CCACCTFROM>/i.test(src) ? 'CREDITCARD' : ''),
    bankId: tag(src, 'BANKID'),
  };
  const transactions = [];
  const blockRe = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
  let m;
  while ((m = blockRe.exec(src))) {
    const b = m[1];
    const amount = Number(tag(b, 'TRNAMT').replace(/,/g, ''));
    const date = parseDate(tag(b, 'DTPOSTED')) || parseDate(tag(b, 'DTUSER'));
    if (!date || !Number.isFinite(amount)) continue;
    transactions.push({
      fitid: tag(b, 'FITID'),
      date,
      amount: Math.round(amount * 100) / 100,
      name: tag(b, 'NAME') || tag(b, 'PAYEE'),
      memo: tag(b, 'MEMO'),
      type: tag(b, 'TRNTYPE').toUpperCase(),
    });
  }
  return { account, transactions };
}
