import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/lib/import/csv.js';
import { parseAmount, parseDate } from '../src/lib/import/values.js';
import { parseOfx } from '../src/lib/import/ofx.js';
import { detectMapping, toEntries } from '../src/lib/import/layouts.js';
import { categoryFromBank, matchRule, merchantKey, transferReason } from '../src/lib/import/merchant.js';
import { buildReview, importIds, rowToTransaction, rulesToSave } from '../src/lib/import/review.js';
import { readStatement } from '../src/lib/import/statement.js';

const CAPITAL_ONE = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-10-12,2026-10-13,1234,KROGER #0412 DETROIT MI,Grocery,84.17,
2026-10-11,2026-10-12,1234,"SQ *BLUE BOTTLE, COFFEE",Dining,6.50,
2026-10-10,2026-10-11,1234,CAPITAL ONE MOBILE PYMT,Payment/Credit,,500.00
2026-10-09,2026-10-10,1234,AMAZON.COM*AB12CD AMZN.COM/BILL WA,Merchandise,23.99,
2026-10-09,2026-10-10,1234,AMAZON.COM*ZZ99QQ AMZN.COM/BILL WA,Merchandise,,23.99
`;

// A bank layout with one signed column and a line of account details first.
const BANK = `Account Name: Checking ...9876
Date,Description,Memo,Amount,Balance
10/14/2026,POS PURCHASE MEIJER # 123,,-62.40,1500.00
10/13/2026,PAYROLL ACME CORP,,2100.00,1562.40
10/12/2026,CAPITAL ONE ONLINE PMT,,-500.00,-537.60
10/12/2026,STARBUCKS 05512,,-5.25,-37.60
10/12/2026,STARBUCKS 05512,,-5.25,-32.35
`;

const QFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>044000024<ACCTID>000123456789<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261014120000[-5:EST]<TRNAMT>-62.40<FITID>2026101401<NAME>MEIJER # 123<MEMO>POS PURCHASE
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261013<TRNAMT>2100.00<FITID>2026101302<NAME>PAYROLL ACME &amp; CO
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const QFX_XML = `<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>4111111111111234</ACCTID></CCACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261012</DTPOSTED><TRNAMT>-84.17</TRNAMT><FITID>ABC1</FITID><NAME>KROGER #0412</NAME></STMTTRN></BANKTRANLIST>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe('reading values', () => {
  it('reads CSV with quotes, commas and line breaks inside quotes', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere']]);
  });

  it('ignores a byte-order mark at the start', () => {
    expect(parseCsv('\uFEFFa,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it.each([
    ['2026-10-14', '2026-10-14'], ['10/14/2026', '2026-10-14'], ['1/5/26', '2026-01-05'],
    ['20261014120000[-5:EST]', '2026-10-14'], ['02/30/2026', null], ['soon', null],
  ])('date %s', (s, want) => expect(parseDate(s)).toBe(want));

  it.each([
    ['$1,234.56', 1234.56], ['-12.34', -12.34], ['(12.34)', -12.34], ['12.34-', -12.34], ['', null], ['n/a', null],
  ])('amount %s', (s, want) => expect(parseAmount(s)).toBe(want));
});

describe('file layouts', () => {
  it('recognizes Capital One and reads charges as spending, payments as money in', () => {
    const rows = parseCsv(CAPITAL_ONE);
    const m = detectMapping(rows);
    expect(m.known).toBe(true);
    const e = toEntries(rows, m);
    expect(e.map((x) => [x.date, x.outflow])).toEqual([
      ['2026-10-12', 84.17], ['2026-10-11', 6.5], ['2026-10-10', -500], ['2026-10-09', 23.99], ['2026-10-09', -23.99],
    ]);
    expect(e[0].bankCategory).toBe('Grocery');
  });

  it('guesses a bank layout below an account line, with negative as spending', () => {
    const rows = parseCsv(BANK);
    const m = detectMapping(rows);
    expect(m.headerRow).toBe(1);
    expect(m.amountMode).toBe('signed');
    expect(m.spendIs).toBe('negative');
    expect(toEntries(rows, m).map((x) => x.outflow)).toEqual([62.4, -2100, 500, 5.25, 5.25]);
  });

  it('takes positive as spending when most amounts are positive (some card exports)', () => {
    const rows = parseCsv('Date,Description,Amount\n10/1/2026,A,10.00\n10/2/2026,B,20.00\n10/3/2026,PAYMENT,-30.00\n');
    expect(detectMapping(rows).spendIs).toBe('positive');
  });

  it('reads SGML QFX and XML OFX', () => {
    const a = parseOfx(QFX_SGML);
    expect(a.account.id).toBe('000123456789');
    expect(a.transactions).toEqual([
      { fitid: '2026101401', date: '2026-10-14', amount: -62.4, name: 'MEIJER # 123', memo: 'POS PURCHASE', type: 'DEBIT' },
      { fitid: '2026101302', date: '2026-10-13', amount: 2100, name: 'PAYROLL ACME & CO', memo: '', type: 'CREDIT' },
    ]);
    const b = readStatement(QFX_XML);
    expect(b.account).toBe('Card ...1234');
    expect(b.entries).toEqual([{ date: '2026-10-12', description: 'KROGER #0412', memo: '', bankCategory: '', outflow: 84.17, fitid: 'ABC1' }]);
  });

  it('names a Capital One file by its card and goes straight to the preview', () => {
    const s = readStatement(CAPITAL_ONE, 'export.csv');
    expect(s.account).toBe('Capital One ...1234');
    expect(s.needsMapping).toBe(false);
  });

  it('asks to confirm a guessed layout, but not once it is saved', () => {
    const first = readStatement(BANK, 'huntington.csv');
    expect(first.needsMapping).toBe(true);
    const saved = [{ signature: first.signature, name: 'Huntington Checking', mapping: first.mapping }];
    const again = readStatement(BANK, 'other.csv', saved);
    expect(again.needsMapping).toBe(false);
    expect(again.account).toBe('Huntington Checking');
  });

  it('says plainly when a file is not a statement', () => {
    expect(readStatement('hello,world\n1,2\n').error).toMatch(/header row/);
  });
});

describe('merchants and rules', () => {
  it.each([
    ['KROGER #0412 DETROIT MI', 'KROGER'],
    ['SQ *BLUE BOTTLE, COFFEE', 'BLUE BOTTLE COFFEE'],
    ['AMAZON.COM*AB12CD AMZN.COM/BILL WA', 'AMAZON'],
    ['POS PURCHASE MEIJER # 123', 'MEIJER'],
    ['SHELL OIL 57444333 TROY MI', 'SHELL OIL'],
    ['NETFLIX.COM', 'NETFLIX'],
  ])('%s -> %s', (desc, key) => expect(merchantKey(desc)).toBe(key));

  it('matches rules by merchant, longest pattern first', () => {
    const rules = [
      { id: 1, pattern: 'AMAZON', action: 'line', budget_line_id: 'shop' },
      { id: 2, pattern: 'AMAZON PRIME', action: 'line', budget_line_id: 'subs' },
      { id: 3, pattern: 'KROGER', action: 'line', budget_line_id: 'groc' },
    ];
    expect(matchRule(rules, 'KROGER #0099 WARREN MI').id).toBe(3);
    expect(matchRule(rules, 'AMAZON PRIME*1A2B3C').id).toBe(2);
    expect(matchRule(rules, 'AMAZON.COM*AB12CD').id).toBe(1);
    expect(matchRule(rules, 'KROGERS FUEL')).toBeNull();
  });

  it('spots transfers and card payments', () => {
    expect(transferReason('CAPITAL ONE ONLINE PMT')).toBe('card payment');
    expect(transferReason('CAPITAL ONE MOBILE PYMT')).toBe('card payment');
    expect(transferReason('ONLINE TRANSFER TO SAVINGS')).toBe('transfer');
    expect(transferReason('ZELLE TO JOHN')).toBe('person-to-person payment');
    expect(transferReason('KROGER #0412')).toBeNull();
  });

  it('maps bank categories it knows', () => {
    expect(categoryFromBank('Dining')).toBe('🍽️ Restaurants & Dining');
    expect(categoryFromBank('Merchandise')).toBeNull();
  });
});

describe('the import preview', () => {
  const lines = [
    { id: 'groc', label: 'Groceries', category: '🛒 Groceries' },
    { id: 'coffee', label: 'Coffee', category: '☕ Coffee & Drinks' },
  ];

  it('ids are stable across overlapping exports and count same-day repeats', () => {
    const e = toEntries(parseCsv(BANK), detectMapping(parseCsv(BANK)));
    const a = importIds(e, 'Checking');
    const b = importIds(e.slice(1), 'Checking');
    expect(a.slice(1)).toEqual(b);
    expect(a[3]).not.toBe(a[4]); // two identical Starbucks lines
    expect(new Set(a).size).toBe(a.length);
  });

  it('sorts lines into new, money in, transfer, already imported and possible duplicate', () => {
    const e = toEntries(parseCsv(BANK), detectMapping(parseCsv(BANK)));
    const ids = importIds(e, 'Checking');
    const existing = [
      { id: 't1', date: '2026-10-13', amount: 62.4, merchant: 'Meijer', import_id: null }, // typed in by hand
      { id: 't2', date: '2026-10-12', amount: 5.25, merchant: 'Starbucks', import_id: ids[3] }, // imported before
    ];
    const rules = [{ pattern: 'STARBUCKS', action: 'line', budget_line_id: 'coffee' }];
    const r = buildReview(e, { account: 'Checking', existing, rules, lines });
    expect(r.map((x) => [x.status, x.include])).toEqual([
      ['possible-duplicate', false],
      ['money-in', false],
      ['transfer', false],
      ['imported', false],
      ['new', true],
    ]);
    expect(r[4].budget_line_id).toBe('coffee');
    expect(r[4].lineSource).toBe('rule');
    expect(r[4].category).toBe('☕ Coffee & Drinks');
  });

  it('a hand-entered transaction can only excuse one statement line', () => {
    const e = [
      { date: '2026-10-12', description: 'A', outflow: 5, fitid: '', memo: '', bankCategory: '' },
      { date: '2026-10-12', description: 'A', outflow: 5, fitid: '', memo: '', bankCategory: '' },
    ];
    const r = buildReview(e, { account: 'x', existing: [{ id: 't', date: '2026-10-12', amount: 5, import_id: null }] });
    expect(r.map((x) => x.status)).toEqual(['possible-duplicate', 'new']);
  });

  it('an automatically logged bill is caught as a possible duplicate of the real charge', () => {
    const e = [{ date: '2026-10-02', description: 'RENT PAYMENT', outflow: 1400, fitid: '', memo: '', bankCategory: '' }];
    const r = buildReview(e, { account: 'x', existing: [{ id: 'auto', date: '2026-10-01', amount: 1400, merchant: 'Rent', import_id: 'rec:r:2026-10' }] });
    expect(r[0].status).toBe('possible-duplicate');
  });

  it('suggests a line from the description when no rule applies', () => {
    const e = [{ date: '2026-10-12', description: 'NEIGHBORHOOD GROCERY', outflow: 30, fitid: '', memo: '', bankCategory: '' }];
    const r = buildReview(e, { account: 'x', lines });
    expect(r[0].budget_line_id).toBe('groc');
    expect(r[0].lineSource).toBe('guess');
  });

  it('builds the transaction and the rules to remember', () => {
    const e = [{ date: '2026-10-12', description: 'KROGER #0412 DETROIT MI', outflow: 84.17, fitid: '', memo: '', bankCategory: 'Grocery' }];
    const [row] = buildReview(e, { account: 'Capital One ...1234', lines });
    const tx = rowToTransaction({ ...row, budget_line_id: 'groc' }, 'Capital One ...1234');
    expect(tx).toMatchObject({ amount: 84.17, merchant: 'Kroger', budget_line_id: 'groc', source: 'import', account: 'Capital One ...1234', date: '2026-10-12' });
    expect(tx.import_id).toMatch(/^csv:capitalone1234:2026-10-12:84\.17:/);
    expect(rulesToSave([{ ...row, budget_line_id: 'groc', remember: true }, { ...row, budget_line_id: 'coffee', remember: false }]))
      .toEqual([{ pattern: 'KROGER', action: 'line', budget_line_id: 'groc' }]);
  });
});
