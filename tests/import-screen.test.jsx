// @vitest-environment jsdom
//
// The import screen from file to saved transactions, with the database
// replaced by fakes: what gets saved, what is left out, and what is learned.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({
  apiFetchRules: vi.fn(),
  apiFetchImportProfiles: vi.fn(),
  apiFetchTransactionsBetween: vi.fn(),
  apiImportTransactions: vi.fn(),
  apiSaveRules: vi.fn(),
  apiSaveImportProfile: vi.fn(),
  apiDeleteRule: vi.fn(),
}));
vi.mock('../src/lib/api.js', () => api);
const { ImportStatement } = await import('../src/features/spending/ImportStatement.jsx');

const CAPITAL_ONE = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
2026-10-12,2026-10-13,1234,KROGER #0412 DETROIT MI,Grocery,84.17,
2026-10-11,2026-10-12,1234,KROGER #0099 WARREN MI,Grocery,12.00,
2026-10-10,2026-10-11,1234,CAPITAL ONE MOBILE PYMT,Payment/Credit,,500.00
2026-10-09,2026-10-10,1234,NETFLIX.COM,Entertainment,15.49,
`;
const BANK = `Date,Description,Amount
10/14/2026,MEIJER # 123,-62.40
10/13/2026,PAYROLL ACME,2100.00
`;
const BUDGET = { expenses: [
  { id: 'groc', label: 'Groceries', category: '🛒 Groceries' },
  { id: 'subs', label: 'Streaming', category: '📺 Subscriptions' },
] };

beforeEach(() => {
  api.apiFetchRules.mockResolvedValue({ data: [{ id: 'r1', pattern: 'NETFLIX', action: 'line', budget_line_id: 'subs' }], error: null });
  api.apiFetchImportProfiles.mockResolvedValue({ data: [], error: null });
  api.apiFetchTransactionsBetween.mockResolvedValue({ data: [], error: null });
  api.apiImportTransactions.mockImplementation(async (rows) => ({ data: rows.map((r, i) => ({ ...r, id: `t${i}` })), error: null }));
  api.apiSaveRules.mockImplementation(async (rules) => ({ data: rules, error: null }));
  api.apiSaveImportProfile.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function open(onImported = vi.fn()) {
  await act(async () => {
    render(<ImportStatement householdId="h1" userId="u1" budget={BUDGET} onClose={() => {}} onImported={onImported} />);
  });
  return onImported;
}

async function choose(text, name) {
  const file = new File([text], name, { type: 'text/csv' });
  await act(async () => { fireEvent.change(screen.getByLabelText('Statement file'), { target: { files: [file] } }); });
}

describe('importing a statement', () => {
  it('imports charges, leaves out the card payment, applies rules and learns new ones', async () => {
    const onImported = await open();
    await choose(CAPITAL_ONE, 'capone.csv');
    expect(screen.getByText(/3 to import/)).toBeTruthy();
    expect(screen.getByDisplayValue('Capital One ...1234')).toBeTruthy();

    // Netflix came from the existing rule; Kroger is set once and both Kroger lines follow.
    const krogerSelect = screen.getByLabelText('Budget line for KROGER #0412 DETROIT MI');
    await act(async () => { fireEvent.change(krogerSelect, { target: { value: 'groc' } }); });
    expect(screen.getByLabelText('Budget line for KROGER #0099 WARREN MI').value).toBe('groc');
    expect(screen.getByLabelText('Budget line for NETFLIX.COM').value).toBe('subs');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import 3' })); });
    const [rows, hid, uid] = api.apiImportTransactions.mock.calls[0];
    expect([hid, uid]).toEqual(['h1', 'u1']);
    expect(rows.map((r) => [r.merchant, r.amount, r.budget_line_id, r.account])).toEqual([
      ['Kroger', 84.17, 'groc', 'Capital One ...1234'],
      ['Kroger', 12, 'groc', 'Capital One ...1234'],
      ['Netflix', 15.49, 'subs', 'Capital One ...1234'],
    ]);
    expect(api.apiSaveRules.mock.calls[0][0]).toEqual([{ pattern: 'KROGER', action: 'line', budget_line_id: 'groc' }]);
    expect(onImported).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ merchant: 'Kroger' })]));
    expect(screen.getByText(/Imported 3 transactions/)).toBeTruthy();
    expect(screen.getByText(/1 merchant rule saved/)).toBeTruthy();
  });

  it('can include a line that was left out', async () => {
    await open();
    await choose(CAPITAL_ONE, 'capone.csv');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Left out' })); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Import CAPITAL ONE MOBILE PYMT')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Import 4' })); });
    const rows = api.apiImportTransactions.mock.calls[0][0];
    expect(rows.find((r) => r.description.startsWith('CAPITAL ONE')).amount).toBe(-500);
  });

  it('asks about the columns of a new layout and remembers them', async () => {
    await open();
    await choose(BANK, 'huntington.csv');
    expect(screen.getByText(/First time seeing this file layout/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('e.g. Huntington Checking'), { target: { value: 'Huntington Checking' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue' })); });
    expect(api.apiSaveImportProfile).toHaveBeenCalledWith(expect.objectContaining({ signature: 'date|description|amount', name: 'Huntington Checking' }), 'h1');
    expect(screen.getByText(/1 to import/)).toBeTruthy();
  });

  it('says what is wrong with a file that is not a statement', async () => {
    await open();
    await choose('hello,world\n1,2\n', 'notes.csv');
    expect(screen.getByText(/does not look like a bank statement/)).toBeTruthy();
  });
});
